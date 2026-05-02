/**
 * spatial.worker — SYNC / INCREMENTAL / HIT_TEST 协议契约测试。
 *
 * 这个 worker 是 cold-layer / hot-layer / hitTest 的事实来源。它在
 * 模块顶层把 `self.onmessage = handler` 注册下来，所以测试必须：
 *   1. 在 import 之前注入 `globalThis.self` 和 `globalThis.postMessage`
 *   2. 用 `vi.resetModules()` 隔离每个测试，避免 worker 内部 module-level
 *      Map / RBush 跨用例污染
 *   3. 用真实 entity（createApolloEntity）— 不 mock 业务核心
 *
 * 验证项：
 *   - SYNC 返回 COLD_READY + 包含 entity 的 FeatureCollection
 *   - INCREMENTAL 返回 COLD_DELTA(changed/removed)，且 changed 只覆盖
 *     差量影响范围（受 lane 邻接图约束）
 *   - HIT_TEST 返回 HIT_RESULT，命中 / miss 行为对得上 hit radius
 *   - excludeId 在 SYNC 路径生效
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LaneEntity, JunctionEntity, SignalEntity } from '@/types/apollo';
import type { LngLat } from '@/core/geometry/interpolate';
import { createApolloEntity } from '@/core/geometry/apolloCompile';
import type { WorkerRequest, WorkerResponse, HitResult, EntityFeatureGroup } from '../protocol';

// ── Worker harness ───────────────────────────────────────────

interface WorkerHandle {
  send(req: WorkerRequest): WorkerResponse;
  responses: WorkerResponse[];
}

/**
 * 加载一个干净的 spatial.worker。每次调用都 reset modules，所以 worker
 * 内部的 `tree / entityMap / featureCache / decorationCache / junctionGraph`
 * 都从空开始。
 */
async function loadWorker(): Promise<WorkerHandle> {
  vi.resetModules();
  const responses: WorkerResponse[] = [];
  const messageHandlers: Array<(e: MessageEvent<WorkerRequest>) => void> = [];

  const fakeSelf = {
    set onmessage(h: (e: MessageEvent<WorkerRequest>) => void) {
      messageHandlers.push(h);
    },
  };

  // 注入到 worker 模块的全局环境
  vi.stubGlobal('self', fakeSelf);
  vi.stubGlobal('postMessage', (msg: WorkerResponse) => {
    responses.push(msg);
  });

  await import('../spatial.worker');
  if (messageHandlers.length === 0) {
    throw new Error('spatial.worker did not register self.onmessage');
  }
  const handler = messageHandlers[0]!;

  return {
    responses,
    send(req: WorkerRequest): WorkerResponse {
      const before = responses.length;
      handler(new MessageEvent<WorkerRequest>('message', { data: req }));
      const after = responses[before];
      if (!after) {
        throw new Error(`worker did not respond to ${req.type}`);
      }
      return after;
    },
  };
}

beforeEach(() => {
  // 上一轮注入的 stub 必须清掉，否则下一次 loadWorker 会拿到旧的 self
  vi.unstubAllGlobals();
});

// ── Fixtures ─────────────────────────────────────────────────

function makeLane(id: string, points: LngLat[]): LaneEntity {
  const entity = createApolloEntity('lane', 'drawPolyline', points, []) as LaneEntity;
  // 工厂会随机生成 id，这里固定下来便于断言
  return { ...entity, id };
}

function makeJunction(id: string, points: LngLat[]): JunctionEntity {
  const entity = createApolloEntity('junction', 'drawPolygon', points, []) as JunctionEntity;
  return { ...entity, id };
}

function makeSignal(id: string, points: LngLat[]): SignalEntity {
  const entity = createApolloEntity('signal', 'drawPolyline', points, []) as SignalEntity;
  return { ...entity, id };
}

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function coldReadyFeatures(
  resp: Extract<WorkerResponse, { type: 'COLD_READY' }>,
): GeoJSON.Feature[] {
  return resp.featureCollection?.features ?? resp.groups.flatMap((group) => group.features);
}

// ── SYNC ──────────────────────────────────────────────────────

describe('spatial.worker — SYNC', () => {
  it('空 entities 返回 COLD_READY 与空 FeatureCollection', async () => {
    const w = await loadWorker();
    const requestId = rid();
    const resp = w.send({ type: 'SYNC', requestId, entities: [] });
    expect(resp.type).toBe('COLD_READY');
    expect(resp.requestId).toBe(requestId);
    if (resp.type === 'COLD_READY') {
      expect(coldReadyFeatures(resp)).toEqual([]);
    }
  });

  it('多个 lane 的 SYNC 产出非空 features，每个 entity 至少有 1 条 feature', async () => {
    const w = await loadWorker();
    const lanes = [
      makeLane('a', [
        [116.0, 30.0],
        [116.001, 30.0],
      ]),
      makeLane('b', [
        [116.001, 30.0],
        [116.002, 30.0],
      ]),
    ];
    const resp = w.send({ type: 'SYNC', requestId: rid(), entities: lanes });
    expect(resp.type).toBe('COLD_READY');
    if (resp.type === 'COLD_READY') {
      const features = coldReadyFeatures(resp);
      expect(features.length).toBeGreaterThan(0);
      // a / b 各自的 feature 都应出现
      const ids = new Set(features.map((f) => f.properties?.id));
      expect(ids.has('a')).toBe(true);
      expect(ids.has('b')).toBe(true);
    }
  });

  it('单根 lane 的 SYNC 也产出 laneBoundaryDecor features（无 junction 也要画边界）', async () => {
    // Regression: spatial.worker 之前有 `if (laneCount < 2)` 快路径，
    // 直接跳过了 applyLaneJunctions → decorateBoundary。结果是用户画的
    // 第一根车道完全没有可见边界（compileApolloFeatures 只发 noStroke
    // 基线，被 cold-line filter 过滤）。修复后 `< 1` 才走 fast-path。
    const w = await loadWorker();
    const lane = makeLane('only', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const resp = w.send({ type: 'SYNC', requestId: rid(), entities: [lane] });
    if (resp.type !== 'COLD_READY') throw new Error('expected COLD_READY');
    const decorFeatures = coldReadyFeatures(resp).filter(
      (f) => f.properties?.role === 'laneBoundaryDecor',
    );
    expect(decorFeatures.length).toBeGreaterThan(0);
    // 至少左右各一条
    const sides = new Set(decorFeatures.map((f) => f.properties?.boundarySide));
    expect(sides.has('left')).toBe(true);
    expect(sides.has('right')).toBe(true);
  });

  it('excludeId 排除指定 entity 的 features', async () => {
    const w = await loadWorker();
    const lanes = [
      makeLane('keep', [
        [116.0, 30.0],
        [116.001, 30.0],
      ]),
      makeLane('drop', [
        [116.002, 30.0],
        [116.003, 30.0],
      ]),
    ];
    const resp = w.send({
      type: 'SYNC',
      requestId: rid(),
      entities: lanes,
      excludeId: 'drop',
    });
    if (resp.type !== 'COLD_READY') throw new Error('expected COLD_READY');
    const ids = new Set(coldReadyFeatures(resp).map((f) => f.properties?.id));
    expect(ids.has('keep')).toBe(true);
    expect(ids.has('drop')).toBe(false);
  });
});

// ── INCREMENTAL ──────────────────────────────────────────────

describe('spatial.worker — INCREMENTAL', () => {
  it('对一个空 worker 添加一个 lane，COLD_DELTA.changed 包含该 lane', async () => {
    const w = await loadWorker();
    // SYNC 一个 lane（laneCount=1，确保后续 INCREMENTAL 走完整路径）
    const a = makeLane('a', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [a] });

    const b = makeLane('b', [
      [116.002, 30.0],
      [116.003, 30.0],
    ]);
    const resp = w.send({
      type: 'INCREMENTAL',
      requestId: rid(),
      added: [b],
      removed: [],
      updated: [],
    });
    expect(resp.type).toBe('COLD_DELTA');
    if (resp.type === 'COLD_DELTA') {
      const ids = new Set(resp.changed.map((g: EntityFeatureGroup) => g.id));
      // 新加的 lane 必须出现在 changed 中
      expect(ids.has('b')).toBe(true);
      expect(resp.removed).toEqual([]);
    }
  });

  it('删除一个 lane 时 COLD_DELTA.removed 列出它的 id', async () => {
    const w = await loadWorker();
    const a = makeLane('a', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const b = makeLane('b', [
      [116.001, 30.0],
      [116.002, 30.0],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [a, b] });

    const resp = w.send({
      type: 'INCREMENTAL',
      requestId: rid(),
      added: [],
      removed: ['a'],
      updated: [],
    });
    if (resp.type !== 'COLD_DELTA') throw new Error('expected COLD_DELTA');
    expect(resp.removed).toContain('a');
  });

  it('共享端点的 lanes 互为依赖：更新 a 时 changed 含 a 与 b', async () => {
    const w = await loadWorker();
    // a 和 b 在 (116.001, 30.0) 处共享端点，互为 junction dependent
    const a = makeLane('a', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const b = makeLane('b', [
      [116.001, 30.0],
      [116.002, 30.0],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [a, b] });

    const a2 = makeLane('a', [
      [116.0, 30.0001],
      [116.001, 30.0],
    ]);
    const resp = w.send({
      type: 'INCREMENTAL',
      requestId: rid(),
      added: [],
      removed: [],
      updated: [a2],
    });
    if (resp.type !== 'COLD_DELTA') throw new Error('expected COLD_DELTA');
    const ids = new Set(resp.changed.map((g: EntityFeatureGroup) => g.id));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true); // junction graph 把 b 拉进 affected set
  });

  it('connect 后新共享端点的目标 lane 也进入 COLD_DELTA.changed', async () => {
    const w = await loadWorker();
    const a = makeLane('a', [
      [116.0, 30.0],
      [116.0009, 30.0],
    ]);
    const b = makeLane('b', [
      [116.001, 30.0],
      [116.002, 30.0],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [a, b] });

    const aConnected = makeLane('a', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const resp = w.send({
      type: 'INCREMENTAL',
      requestId: rid(),
      added: [],
      removed: [],
      updated: [aConnected],
    });
    if (resp.type !== 'COLD_DELTA') throw new Error('expected COLD_DELTA');
    const ids = new Set(resp.changed.map((g: EntityFeatureGroup) => g.id));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
  });
});

// ── HIT_TEST ─────────────────────────────────────────────────

describe('spatial.worker — HIT_TEST', () => {
  it('点离 lane 中心很近时返回 HIT_RESULT，hits[0].id 命中', async () => {
    const w = await loadWorker();
    const lane = makeLane('hit-me', [
      [116.0, 30.0],
      [116.0001, 30.0],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [lane] });

    // radius 选 0.001 度，远大于 lane 的几何尺度，必中
    const resp = w.send({
      type: 'HIT_TEST',
      requestId: rid(),
      point: [116.00005, 30.0],
      radius: 0.001,
    });
    expect(resp.type).toBe('HIT_RESULT');
    if (resp.type === 'HIT_RESULT') {
      expect(resp.hits.length).toBeGreaterThan(0);
      expect(resp.hits[0]!.id).toBe('hit-me');
      // distance 字段存在且非负
      expect(resp.hits[0]!.distance).toBeGreaterThanOrEqual(0);
    }
  });

  it('点远离任何 lane 时返回空 hits[]', async () => {
    const w = await loadWorker();
    const lane = makeLane('far', [
      [116.0, 30.0],
      [116.0001, 30.0],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [lane] });

    const resp = w.send({
      type: 'HIT_TEST',
      requestId: rid(),
      point: [120.0, 35.0], // 几百公里以外
      radius: 0.0001,
    });
    if (resp.type !== 'HIT_RESULT') throw new Error('expected HIT_RESULT');
    expect(resp.hits).toEqual<HitResult[]>([]);
  });

  it('多个 lane 时 hits 按 distance 升序', async () => {
    const w = await loadWorker();
    const close = makeLane('close', [
      [116.0, 30.0],
      [116.0001, 30.0],
    ]);
    // 同方向但 lat 偏远的 lane
    const far = makeLane('far', [
      [116.0, 30.001],
      [116.0001, 30.001],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [close, far] });

    const resp = w.send({
      type: 'HIT_TEST',
      requestId: rid(),
      point: [116.00005, 30.0],
      radius: 0.01, // 大半径包含两条
    });
    if (resp.type !== 'HIT_RESULT') throw new Error('expected HIT_RESULT');
    // 距离单调不减
    for (let i = 1; i < resp.hits.length; i++) {
      expect(resp.hits[i]!.distance).toBeGreaterThanOrEqual(resp.hits[i - 1]!.distance);
    }
    if (resp.hits.length >= 2) {
      // close lane 应排在 far 前面
      expect(resp.hits[0]!.id).toBe('close');
    }
  });

  it('signal 的 tier 优先级高于覆盖它的 junction（即使 junction 距离更近）', async () => {
    const w = await loadWorker();
    // 大 junction 多边形覆盖整个测试区域，pointInPolygon = true → distance = 0
    const junction = makeJunction('big-junction', [
      [116.0, 30.0],
      [116.001, 30.0],
      [116.001, 30.001],
      [116.0, 30.001],
    ]);
    // signal stop_line 在多边形内部，distance > 0（点线距离）
    const signal = makeSignal('overlay-signal', [
      [116.00045, 30.0005],
      [116.00055, 30.0005],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [junction, signal] });

    const resp = w.send({
      type: 'HIT_TEST',
      requestId: rid(),
      point: [116.0005, 30.0005],
      radius: 0.0005,
    });
    if (resp.type !== 'HIT_RESULT') throw new Error('expected HIT_RESULT');
    // 两者都进了候选
    const ids = resp.hits.map((h) => h.id);
    expect(ids).toContain('big-junction');
    expect(ids).toContain('overlay-signal');
    // signal 必须排第一（tier 0 < junction tier 3），即使 junction.distance === 0
    expect(resp.hits[0]!.id).toBe('overlay-signal');
  });

  it('同 tier 内仍按 distance 排序（lane vs road tier 都是 2）', async () => {
    const w = await loadWorker();
    const closeLane = makeLane('lane-close', [
      [116.0, 30.0],
      [116.0001, 30.0],
    ]);
    const farLane = makeLane('lane-far', [
      [116.0, 30.0005],
      [116.0001, 30.0005],
    ]);
    w.send({ type: 'SYNC', requestId: rid(), entities: [closeLane, farLane] });

    const resp = w.send({
      type: 'HIT_TEST',
      requestId: rid(),
      point: [116.00005, 30.0],
      radius: 0.01,
    });
    if (resp.type !== 'HIT_RESULT') throw new Error('expected HIT_RESULT');
    if (resp.hits.length >= 2) {
      expect(resp.hits[0]!.id).toBe('lane-close');
      expect(resp.hits[1]!.id).toBe('lane-far');
    }
  });
});
