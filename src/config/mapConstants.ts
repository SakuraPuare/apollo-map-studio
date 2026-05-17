/**
 * 地图全局常量 — 集中管理最常调整的配置项
 *
 * 分类：
 *   MAP_*      地图初始化（中心点、缩放）
 *   LANE_*     车道几何与渲染
 *   ARROW_*    车道方向箭头样式
 *   HIT_*      交互拾取阈值
 */

// ─── 地图初始化 ────────────────────────────────────────────────────────────────

/** 初始中心点 [lng, lat]（默认北京）*/
export const MAP_DEFAULT_CENTER: [number, number] = [116.4, 39.9];

/** 初始缩放级别 */
export const MAP_DEFAULT_ZOOM = 18;

// ─── 车道几何 ──────────────────────────────────────────────────────────────────

/** 车道中心线到左/右边界的默认半宽（米） */
export const DEFAULT_LANE_HALF_WIDTH = 1.75;

/** 新建车道默认限速（米/秒）— 60 km/h 对齐城市道路常规限值 */
export const DEFAULT_LANE_SPEED_LIMIT_MPS = 60 / 3.6;

/** 新建车道默认边界线型 — 虚白线（可跨越） */
export const DEFAULT_LANE_BOUNDARY_TYPE = 'DOTTED_WHITE' as const;

/** Turn 自动识别阈值（弧度） */
/** 起终点方向夹角 < 此值 → NO_TURN（约 25°） */
export const TURN_INFER_NO_TURN_RAD = (25 * Math.PI) / 180;
/** 起终点方向夹角 ≥ 此值 → U_TURN（约 150°） */
export const TURN_INFER_U_TURN_RAD = (150 * Math.PI) / 180;

/** 车道填充多边形透明度 */
export const LANE_FILL_OPACITY = 0.3;

/** 车道边界线宽度（像素） */
export const LANE_EDGE_LINE_WIDTH = 2;

/** 车道边界线不透明度 */
export const LANE_EDGE_LINE_OPACITY = 0.9;

/** 车道中心虚线宽度（像素） */
export const LANE_CENTER_LINE_WIDTH = 1;

/** 车道中心虚线不透明度 */
export const LANE_CENTER_LINE_OPACITY = 0.4;

// ─── 方向箭头 ──────────────────────────────────────────────────────────────────

/** 方向箭头字号（像素） */
export const LANE_ARROW_TEXT_SIZE = 10;

/** 方向箭头间距（像素，MapLibre symbol-spacing） */
export const LANE_ARROW_SYMBOL_SPACING = 160;

/** 方向箭头颜色 */
export const LANE_ARROW_COLOR = '#ffffff';

/** 方向箭头不透明度 */
export const LANE_ARROW_OPACITY = 0.85;

// ─── 交互拾取阈值 ──────────────────────────────────────────────────────────────

/** 点击判定最大移动距离（像素），超过则视为拖动而非点击 */
export const CLICK_THRESHOLD_PX = 5;

/** 控制点拾取热区半径（像素），queryRenderedFeatures bbox 的单侧扩展 */
export const HIT_BBOX_PADDING_PX = 8;

/** 实体 hitTest 半径（像素），转换为经纬度后传入 Worker */
export const HIT_TEST_RADIUS_PX = 10;

// ─── 地理换算 ──────────────────────────────────────────────────────────────────

/** 1 纬度 ≈ 多少米（WGS84 子午线长 / 360°）；lng 方向需再乘 cosLat */
export const METERS_PER_DEGREE = 111_319.5;

// ─── Overlap pipeline ──────────────────────────────────────────────────────────

/** Lane×lane 端点重合判定容差（米）—— 用于区分合流/分流/穿越 */
export const OVERLAP_LANE_ENDPOINT_TOL_M = 0.5;

/** stopLine bbox 周围预留半径（lng-deg ≈ 100m / METERS_PER_DEGREE） */
export const OVERLAP_STOPLINE_PROBE_DEG = 100 / METERS_PER_DEGREE;

// ─── Snap (吸附) ───────────────────────────────────────────────────────────────

/** 吸附触发阈值（像素），按当前 zoom 实时换算为米 */
export const SNAP_RADIUS_PX = 12;
