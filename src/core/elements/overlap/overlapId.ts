/**
 * Overlap pipeline — 稳定 id 派生.
 *
 * 设计目标：同一组参与实体（无序）→ 同一个 overlap id，便于 reconcile 做 set diff。
 *
 * 格式：`Overlap_<hex16>`，hex 长度 16 (64-bit FNV1a)。
 *   不与 nextEntityId('overlap', ...) 用的 `^Overlap_(\\d+)$` 正则冲突，
 *   因此「自动派生」与「手工新建」的 id 空间天然不重叠。
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64(str: string): bigint {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ BigInt(str.charCodeAt(i))) & MASK_64;
    h = (h * FNV_PRIME) & MASK_64;
  }
  return h;
}

/**
 * 计算 overlap id。participantIds 在内部排序 → 顺序无关。
 *
 * 用 `` 作为分隔符，避免 id 内容碰撞（实体 id 都是 ASCII 字母数字下划线）。
 */
export function makeOverlapId(participantIds: readonly string[]): string {
  const sorted = [...participantIds].sort();
  const key = sorted.join('');
  const h = fnv1a64(key);
  return `Overlap_${h.toString(16).padStart(16, '0')}`;
}

/** 判断 id 是否由 makeOverlapId 派生（用于区分「自动 vs 手工」） */
export function isDerivedOverlapId(id: string): boolean {
  return /^Overlap_[0-9a-f]{16}$/.test(id);
}
