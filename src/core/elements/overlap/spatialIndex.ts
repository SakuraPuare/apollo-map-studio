/**
 * Overlap pipeline — 空间索引（RBush 包装）.
 *
 * 5w 实体规模下用网格索引会被密集分布的 lane 撑爆；R-tree O(log N + k)
 * 查询才能扛住 30k+ lane × 50k+ entities 的配对扫描。rbush 4.x 已在仓库
 * 依赖里（见 package.json），零引入成本。
 *
 * 设计原则：
 *   - 节点 = { id, entityType, minX, minY, maxX, maxY }；不直接持有 entity 引用，
 *     避免索引和 store 双源持有同一个对象造成误更新。
 *   - 增量维护：编辑期 store mutation 后只对 dirty 节点 remove + insert。
 *     RBush 的 remove 需要传入完整节点对象，因此 SpatialIndex 内部用
 *     `Map<id, IndexNode>` 反查上次注册的 bbox。
 *   - bbox 单位 = 经纬度（lng/lat），caller 自己决定膨胀半径（米 → 度）。
 */
import RBush from 'rbush';
import type { MapEntity } from '@/types/entities';
import { OVERLAP_STOPLINE_PROBE_DEG } from '@/config/mapConstants';
import { getCenterline, getPolygon, getStopLines, getPolylines } from './geometryAdapters';
import { bboxOfPoints, bboxUnion } from './intersect';
import type { BBox, IndexNode } from './types';

/** RBush 期望节点上有 minX/minY/maxX/maxY 字段；IndexNode 已满足 */
class OverlapRBush extends RBush<IndexNode> {
  override toBBox(node: IndexNode): BBox {
    return node;
  }
  override compareMinX(a: IndexNode, b: IndexNode): number {
    return a.minX - b.minX;
  }
  override compareMinY(a: IndexNode, b: IndexNode): number {
    return a.minY - b.minY;
  }
}

/** 算单个实体的 bbox。返回 null 表示该实体不进索引 */
export function bboxForEntity(entity: MapEntity): BBox | null {
  if (entity.entityType === 'lane') {
    const pts = getCenterline(entity);
    if (pts.length < 2) return null;
    return bboxOfPoints(pts);
  }
  const poly = getPolygon(entity);
  if (poly && poly.length >= 3) return bboxOfPoints(poly);

  const stopLines = getStopLines(entity);
  if (stopLines.length > 0) {
    const boxes = stopLines
      .map((p) => bboxOfPoints(p, OVERLAP_STOPLINE_PROBE_DEG))
      .filter((b): b is BBox => b !== null);
    return bboxUnion(boxes);
  }

  const polylines = getPolylines(entity);
  if (polylines.length > 0) {
    const boxes = polylines.map((p) => bboxOfPoints(p)).filter((b): b is BBox => b !== null);
    return bboxUnion(boxes);
  }
  return null;
}

function bboxSignature(b: BBox): string {
  return `${b.minX}|${b.minY}|${b.maxX}|${b.maxY}`;
}

export class SpatialIndex {
  private readonly tree = new OverlapRBush();
  private readonly nodes = new Map<string, IndexNode>();
  /**
   * 上一次见过的 bbox 签名（"minX|minY|maxX|maxY"），不缓存 entity ref 本身.
   *
   * 早期版本缓存 entity reference 做 `prev === e` 比对，但当 entities 由 immer
   * producer 内部 reconcile 喂进来时，draft proxy 在 producer 退出时被 freeze
   * 替换 → 后续 syncFromEntities 永远 ref-miss → 全图 cold-rebuild。改为 bbox
   * 签名后：
   *   - lane.junctionId 这种非几何字段变更不会触发 re-insert（节省 tree mutation）
   *   - centerline / polygon 内容变了立刻触发（几何就是签名的来源）
   *   - immer freeze 切换 ref 时签名不变 → 跳过
   */
  private readonly bboxSig = new Map<string, string>();

  /** 全量构建（导入完成后调用一次；O(N)） */
  build(entities: ReadonlyMap<string, MapEntity>): void {
    this.tree.clear();
    this.nodes.clear();
    this.bboxSig.clear();
    const bulk: IndexNode[] = [];
    for (const e of entities.values()) {
      const bbox = bboxForEntity(e);
      if (!bbox) continue;
      const node: IndexNode = { id: e.id, entityType: e.entityType, ...bbox };
      this.nodes.set(e.id, node);
      this.bboxSig.set(e.id, bboxSignature(bbox));
      bulk.push(node);
    }
    if (bulk.length > 0) this.tree.load(bulk);
  }

  /**
   * 全量同步（O(N)）：扫一次 entities，按 bbox 签名比对：
   *   - 新增 / 几何变化 → 重 insert
   *   - 已消失 → remove
   *   - 签名一致 → 跳过
   *
   * 适用：cold start / undo-redo / 全量 reconcile。
   * 增量编辑请用 `syncDirty` —— 把 5w 量纲下的 ~10ms 降到 < 0.5ms。
   */
  syncFromEntities(entities: ReadonlyMap<string, MapEntity>): void {
    if (this.nodes.size === 0) {
      this.build(entities);
      return;
    }
    const seen = new Set<string>();
    for (const e of entities.values()) {
      seen.add(e.id);
      this.insert(e);
    }
    for (const id of [...this.bboxSig.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  /**
   * O(|dirtyIds|) 增量同步：caller 已经知道 mutation 范围（store 直接拿到
   * dirty 集），不需要全表 ref 比对。
   *
   * 协议（caller 必须保证）：dirtyIds 涵盖本轮所有几何变化的实体 id —— 包括
   * 新增、删除、modify。violation 不再被 size 启发式兜底（旧版 `Math.abs
   * (entities.size - this.nodes.size) > expectedDelta` 在 size 相同但实体集
   * 完全不同的边界上漏判 → 索引 stale 不可见）。冷启 / clear() 后由
   * `nodes.size === 0` 一次性全量构建。
   *
   * 编辑期单次调用 < 0.5ms（5w 实体 dirty=1）；这是 incremental reconcile
   * < 16ms 帧预算的关键抓手。
   */
  syncDirty(entities: ReadonlyMap<string, MapEntity>, dirtyIds: ReadonlySet<string>): void {
    if (this.nodes.size === 0) {
      this.syncFromEntities(entities);
      return;
    }
    for (const id of dirtyIds) {
      const e = entities.get(id);
      if (e) this.insert(e);
      else this.remove(id);
    }
  }

  /** 增量插入 / 更新；bbox 签名一致时直接跳过，避免无意义的 tree mutation */
  insert(entity: MapEntity): void {
    const bbox = bboxForEntity(entity);
    if (!bbox) {
      if (this.bboxSig.has(entity.id)) this.remove(entity.id);
      return;
    }
    const sig = bboxSignature(bbox);
    if (this.bboxSig.get(entity.id) === sig) return;
    const existing = this.nodes.get(entity.id);
    if (existing) this.tree.remove(existing);
    const node: IndexNode = { id: entity.id, entityType: entity.entityType, ...bbox };
    this.nodes.set(entity.id, node);
    this.bboxSig.set(entity.id, sig);
    this.tree.insert(node);
  }

  /** 删除 */
  remove(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      this.tree.remove(node);
      this.nodes.delete(id);
    }
    this.bboxSig.delete(id);
  }

  /** bbox 查询（lng/lat 度数空间） */
  queryBBox(bbox: BBox): IndexNode[] {
    return this.tree.search(bbox);
  }

  /** 查询单个实体的所有空间邻居（不含自身） */
  queryNeighbors(id: string): IndexNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return this.tree.search(node).filter((n) => n.id !== id);
  }

  /** 当前索引大小（debug + perf telemetry） */
  size(): number {
    return this.nodes.size;
  }

  /** 已注册节点的 bbox（reconcile 主流程做去重 dedup 用） */
  getBBox(id: string): BBox | null {
    const n = this.nodes.get(id);
    return n ? { minX: n.minX, minY: n.minY, maxX: n.maxX, maxY: n.maxY } : null;
  }

  /** 全量重置（worker 终止 / 测试用） */
  clear(): void {
    this.tree.clear();
    this.nodes.clear();
    this.bboxSig.clear();
  }
}

/**
 * 模块级 Singleton —— store 直接复用同一个索引实例，避免 reconcile 每次 new
 * 一个新的 RBush + load N 节点。zundo undo/redo 时也只是 entities 引用切换，
 * `syncFromEntities` 通过 bbox 签名比对自动失效需要更新的节点。
 */
let sharedIndex: SpatialIndex | null = null;
export function getSharedSpatialIndex(): SpatialIndex {
  if (!sharedIndex) sharedIndex = new SpatialIndex();
  return sharedIndex;
}
export function resetSharedSpatialIndex(): void {
  sharedIndex = null;
}
