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

/** 100m / 111320 ≈ 0.0009 lng-deg；信号灯 stopLine 周围预留半径 */
const STOPLINE_PROBE_DEG = 0.0009;

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
    const boxes = stopLines.map((p) => bboxOfPoints(p, STOPLINE_PROBE_DEG));
    return bboxUnion(boxes);
  }

  const polylines = getPolylines(entity);
  if (polylines.length > 0) {
    return bboxUnion(polylines.map((p) => bboxOfPoints(p)));
  }
  return null;
}

export class SpatialIndex {
  private readonly tree = new OverlapRBush();
  private readonly nodes = new Map<string, IndexNode>();

  /** 全量构建（导入完成后调用一次；O(N)） */
  build(entities: ReadonlyMap<string, MapEntity>): void {
    this.tree.clear();
    this.nodes.clear();
    const bulk: IndexNode[] = [];
    for (const e of entities.values()) {
      const bbox = bboxForEntity(e);
      if (!bbox) continue;
      const node: IndexNode = { id: e.id, entityType: e.entityType, ...bbox };
      this.nodes.set(e.id, node);
      bulk.push(node);
    }
    if (bulk.length > 0) this.tree.load(bulk);
  }

  /** 增量插入（new entity） */
  insert(entity: MapEntity): void {
    const bbox = bboxForEntity(entity);
    if (!bbox) return;
    const existing = this.nodes.get(entity.id);
    if (existing) this.tree.remove(existing);
    const node: IndexNode = { id: entity.id, entityType: entity.entityType, ...bbox };
    this.nodes.set(entity.id, node);
    this.tree.insert(node);
  }

  /** 删除 */
  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.tree.remove(node);
    this.nodes.delete(id);
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
}
