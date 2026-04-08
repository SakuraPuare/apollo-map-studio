# 高精地图 Web 编辑器 (HD Map Web Editor) - 架构与工程设计规范

## 1. 项目定位与核心目标
本项目并非传统的 Web GIS 标注网页，而是一个运行在浏览器中的**轻量级 CAD 渲染引擎与关系型空间数据库**。主要面向 Lumina 等工业级落地场景，以及自动驾驶路网规划工具链。

* **极高性能：** 支持十万级以上道路元素（车道线、路口、车位、信号灯等）的秒级解析与 60fps 丝滑交互。
* **参数化几何：** 抛弃底层硬编码图形，基于参数（原点、宽高、旋转角、控制点）动态生成和渲染几何体。
* **严格解耦：** UI 视图、渲染画布、空间计算与状态数据必须严格隔离，确保项目具备向 Rust/WebAssembly 计算底层演进的潜力。
* **协议兼容：** 底层数据结构设计需高度契合 Apollo 等高精地图规范（支持 Protocol Buffers 格式的无损导入导出）。

## 2. 技术栈核心选型与职责边界

* **框架与 UI：** `React 19` + `TypeScript` + `Tailwind CSS` + `Radix UI` (构建类 IDE 的专业桌面级界面)
* **数据中心：** `Zustand` + `Immer` + `Zundo` (仅存储纯净的、扁平化的业务参数，提供低开销的撤销/重做)
* **渲染底座：** `maplibre-gl` (纯粹的 WebGL 渲染器，剥离一切业务逻辑) + `geojson-vt` (海量静态数据实时切片)
* **交互控制：** `xstate` (有限状态机，接管并统筹所有地图鼠标/键盘事件，杜绝事件冲突)
* **空间计算：** `@turf/turf` + `rbush` (配合 Web Worker 进行 R 树碰撞检测和参数化几何多边形推演)

## 3. 五层解耦架构设计 (Five-Layer Architecture)

系统严格划分为以下五层，单向数据流转，越往底层越与 UI 无关：

1.  **数据模型层 (Data Layer)：单一事实来源**
    * 采用扁平化哈希表 (Map) 管理实体，拒绝深层嵌套。
    * 仅存储参数化数据（如：`{ id: 'spot_1', type: 'parking', center: [lng, lat], width: 2, length: 5, angle: 45 }`）。
2.  **空间计算核心 (Compute Engine)：主线程降压**
    * 由 Web Worker 承载海量数据的初始化与转换。
    * 维护全局 `rbush` R树，提供毫秒级的鼠标悬停/选中碰撞检测。
3.  **交互控制器 (Event & FSM Controller)：系统的“大脑”**
    * 由 `xstate` 管理编辑器宏观状态 (`IDLE`, `DRAWING`, `ROTATING`, `EDITING_CURVE`)。
    * 全局拦截 MapLibre 的原生 Canvas 事件，按当前状态派发逻辑。
4.  **渲染层 (Rendering Layer)：动静分离**
    * **冷层 (Static)：** 未选中的十万级要素，通过矢量瓦片静默渲染。
    * **热层 (Active)：** 当前高亮/编辑中的单一要素，极轻量。拖拽时通过 `map.getSource().setData()` 直接与 GPU 通信，绕过 React Diff 确保 60fps。
5.  **应用 UI 层 (App UI)：**
    * 响应 Zustand 的状态变更，更新图层树与属性面板 (`react-hook-form` + `zod`)。

## 4. 核心工作流示例：拖拽旋转对象

1.  **按下控制柄：** 状态机切入 `ROTATING_BOX` 状态。
2.  **鼠标拖拽：** 控制器捕获 `mousemove`，计算最新角度 $\theta$。
3.  **实时推演：** Turf.js 根据新角度实时计算生成新的 GeoJSON Polygon 顶点。
4.  **热更新：** 直接调用 MapLibre `setData()` 更新【热层】（不触发 React 渲染）。
5.  **落盘持久化：** 鼠标松开，状态机切回 `IDLE`，将角度落入 Zustand，触发 Zundo 快照，UI 属性面板同步更新。

## 5. 标准目录结构规范

```text
src/
├── core/                  # 核心引擎 (纯逻辑，无框架依赖)
│   ├── fsm/               # XState 状态机配置与交互控制器
│   ├── geometry/          # 参数化几何编译器 (Turf 封装)
│   ├── spatial/           # RBush 空间索引维护
│   └── workers/           # Web Worker 线程脚本
├── store/                 # 状态管理
│   ├── mapStore.ts        # 扁平化参数数据字典 (Zustand)
│   └── uiStore.ts         # 编辑器 UI 状态 (图层显隐、选中态)
├── components/            # React 视图组件
│   ├── map/               # MapLibre 实例挂载与 Source/Layer 声明
│   ├── panels/            # 右侧属性面板 (Form & Zod)
│   └── layout/            # 核心布局 (基于 react-resizable-panels)
├── types/                 # 核心类型定义
│   └── apollo.d.ts        # 高精地图底层协议类型映射
└── utils/
```

---

## 6. 数据模型层详细设计 (Data Layer Specification)

### 6.1 设计原则

* **扁平化优先：** 所有实体存储在 `Map<string, Entity>` 哈希表中，通过 ID 字符串引用关系，拒绝对象嵌套。
* **参数化存储：** 仅存储生成几何体所需的最小参数集，渲染用的 GeoJSON 由计算层实时编译。
* **Apollo 协议对齐：** TypeScript 类型与 Apollo `map_*.proto` 字段一一映射，确保 protobuf 无损往返。
* **ID 策略：** 采用 `{type}_{nanoid(12)}` 格式（如 `lane_V1StGp4kQz3R`），兼顾可读性与唯一性。

### 6.2 基础几何类型 (对齐 `map_geometry.proto`)

```typescript
/** 经纬度点 (WGS84) */
interface PointENU {
  x: number;  // longitude
  y: number;  // latitude
  z?: number; // elevation (meters)
}

/** 线段 */
interface LineSegment {
  points: PointENU[];
}

/** 曲线段 —— 联合类型，对齐 Apollo CurveSegment */
type CurveSegment =
  | { type: 'line'; lineSegment: LineSegment; s: number; startPosition: PointENU; heading: number; length: number }
  // 未来扩展：arc, spiral 等

/** 曲线 (由多段组成) */
interface Curve {
  segments: CurveSegment[];
}

/** 多边形 */
interface Polygon {
  points: PointENU[];
}
```

### 6.3 核心实体类型 (对齐 Apollo HD Map Proto)

#### 6.3.1 Lane (车道)

```typescript
/** 车道边界类型 —— 对齐 LaneBoundaryType.Type */
type BoundaryLineType =
  | 'UNKNOWN' | 'DOTTED_YELLOW' | 'DOTTED_WHITE'
  | 'SOLID_YELLOW' | 'SOLID_WHITE' | 'DOUBLE_YELLOW' | 'CURB';

interface LaneBoundaryTypeEntry {
  s: number;           // 沿车道的弧长位置
  types: BoundaryLineType[];
}

interface LaneBoundary {
  curve: Curve;
  length: number;
  boundaryType: LaneBoundaryTypeEntry[];
}

type LaneType = 'NONE' | 'CITY_DRIVING' | 'BIKING' | 'SIDEWALK' | 'PARKING' | 'SHOULDER';
type LaneTurn = 'NO_TURN' | 'LEFT_TURN' | 'RIGHT_TURN' | 'U_TURN';
type LaneDirection = 'FORWARD' | 'BACKWARD' | 'BIDIRECTION';

interface LaneSampleAssociation {
  s: number;
  width: number;
}

interface LaneEntity {
  id: string;
  entityType: 'lane';

  // 几何
  centralCurve: Curve;
  leftBoundary: LaneBoundary;
  rightBoundary: LaneBoundary;
  length: number;

  // 属性
  type: LaneType;
  turn: LaneTurn;
  direction: LaneDirection;
  speedLimit: number;

  // 拓扑关系 (扁平 ID 引用)
  predecessorIds: string[];
  successorIds: string[];
  leftNeighborForwardIds: string[];
  rightNeighborForwardIds: string[];
  leftNeighborReverseIds: string[];
  rightNeighborReverseIds: string[];
  junctionId: string | null;
  overlapIds: string[];

  // 宽度采样
  leftSamples: LaneSampleAssociation[];
  rightSamples: LaneSampleAssociation[];
}
```

#### 6.3.2 Junction (路口)

```typescript
type JunctionType = 'UNKNOWN' | 'IN_ROAD' | 'CROSS_ROAD' | 'FORK_ROAD' | 'MAIN_SIDE' | 'DEAD_END';

interface JunctionEntity {
  id: string;
  entityType: 'junction';
  polygon: Polygon;
  type: JunctionType;
  overlapIds: string[];
}
```

#### 6.3.3 ParkingSpace (车位)

```typescript
interface ParkingSpaceEntity {
  id: string;
  entityType: 'parkingSpace';
  polygon: Polygon;
  heading: number;
  overlapIds: string[];
}
```

#### 6.3.4 Signal (信号灯)

```typescript
type SignalType = 'UNKNOWN_SIGNAL' | 'MIX_2_HORIZONTAL' | 'MIX_2_VERTICAL'
  | 'MIX_3_HORIZONTAL' | 'MIX_3_VERTICAL' | 'SINGLE';

type SubsignalType = 'UNKNOWN_SUBSIGNAL' | 'CIRCLE' | 'ARROW_LEFT'
  | 'ARROW_FORWARD' | 'ARROW_RIGHT' | 'ARROW_LEFT_AND_FORWARD'
  | 'ARROW_RIGHT_AND_FORWARD' | 'ARROW_U_TURN';

interface Subsignal {
  id: string;
  type: SubsignalType;
  location: PointENU;
}

interface SignalEntity {
  id: string;
  entityType: 'signal';
  boundary: Polygon;
  subsignals: Subsignal[];  // 内嵌，不独立存储
  type: SignalType;
  overlapIds: string[];
  stopLineIds: string[];
}
```

#### 6.3.5 Crosswalk (人行横道)

```typescript
interface CrosswalkEntity {
  id: string;
  entityType: 'crosswalk';
  polygon: Polygon;
  overlapIds: string[];
}
```

#### 6.3.6 StopSign (停车标志)

```typescript
type StopSignType = 'UNKNOWN_STOP_SIGN' | 'ONE_WAY' | 'TWO_WAY'
  | 'THREE_WAY' | 'FOUR_WAY' | 'ALL_WAY';

interface StopSignEntity {
  id: string;
  entityType: 'stopSign';
  stopLines: Curve[];
  position: PointENU;
  type: StopSignType;
  overlapIds: string[];
}
```

#### 6.3.7 SpeedBump (减速带)

```typescript
interface SpeedBumpEntity {
  id: string;
  entityType: 'speedBump';
  position: Curve[];
  overlapIds: string[];
}
```

#### 6.3.8 Road (道路)

```typescript
interface RoadSection {
  id: string;
  laneIds: string[];
}

interface RoadEntity {
  id: string;
  entityType: 'road';
  sections: RoadSection[];
  junctionId: string | null;
  type?: 'UNKNOWN_ROAD' | 'HIGHWAY' | 'CITY_ROAD' | 'PARK';
}
```

#### 6.3.9 Overlap (重叠区域)

```typescript
/** 重叠对象信息 —— 判别联合 */
type ObjectOverlapInfo =
  | { objectType: 'lane'; laneId: string; sRange: [number, number] }
  | { objectType: 'signal'; signalId: string }
  | { objectType: 'stopSign'; stopSignId: string }
  | { objectType: 'crosswalk'; crosswalkId: string }
  | { objectType: 'junction'; junctionId: string }
  | { objectType: 'parkingSpace'; parkingSpaceId: string };

interface OverlapEntity {
  id: string;
  entityType: 'overlap';
  objects: [ObjectOverlapInfo, ObjectOverlapInfo]; // 恰好两个对象
}
```

### 6.4 实体联合类型与存储字典

```typescript
/** 所有可编辑实体的联合类型 */
type MapEntity =
  | LaneEntity
  | JunctionEntity
  | ParkingSpaceEntity
  | SignalEntity
  | CrosswalkEntity
  | StopSignEntity
  | SpeedBumpEntity
  | RoadEntity
  | OverlapEntity;

/** 核心数据字典 —— 单一事实来源 */
type EntityMap = Map<string, MapEntity>;

/** Zustand Store 数据切片 */
interface MapDataSlice {
  entities: EntityMap;
  // 按类型的二级索引 (加速图层渲染查询)
  indices: {
    lanes: Set<string>;
    junctions: Set<string>;
    parkingSpaces: Set<string>;
    signals: Set<string>;
    crosswalks: Set<string>;
    stopSigns: Set<string>;
    speedBumps: Set<string>;
    roads: Set<string>;
    overlaps: Set<string>;
  };
}
```

### 6.5 Zustand Store 设计

```typescript
interface MapStore extends MapDataSlice {
  // 实体 CRUD
  addEntity(entity: MapEntity): void;
  updateEntity(id: string, patch: Partial<MapEntity>): void;
  removeEntity(id: string): void;
  batchUpdate(patches: Array<{ id: string; patch: Partial<MapEntity> }>): void;

  // 查询
  getEntity<T extends MapEntity>(id: string): T | undefined;
  getEntitiesByType<T extends MapEntity['entityType']>(type: T): MapEntity[];

  // 序列化
  exportToApollo(): ApolloMapProto;
  importFromApollo(proto: ApolloMapProto): void;
}

interface UIStore {
  // 选中态
  selectedIds: Set<string>;
  hoveredId: string | null;

  // 图层可见性
  layerVisibility: Record<MapEntity['entityType'], boolean>;

  // 视口
  viewport: { center: [number, number]; zoom: number; bearing: number; pitch: number };

  // 编辑器模式 (由 FSM 驱动，此处为只读镜像)
  editorMode: string;
}
```

### 6.6 Immer + Zundo 撤销/重做策略

* 所有 `addEntity` / `updateEntity` / `removeEntity` 通过 Immer produce 包裹，自动生成不可变快照。
* Zundo 仅追踪 `MapDataSlice`（不追踪 UI 状态），避免撤销操作影响视口或选中态。
* 批量操作 (`batchUpdate`) 合并为单个 Zundo 快照，确保"撤销"一步回退整个批量。
* 快照上限 100 步，超出后 FIFO 淘汰最旧记录。

---

## 7. 空间计算引擎详细设计 (Compute Engine Specification)

### 7.1 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  主线程 (Main Thread)                                    │
│  ┌──────────┐  postMessage   ┌────────────────────────┐ │
│  │ FSM /    │ ──────────────→│  Spatial Worker        │ │
│  │ Store    │ ←──────────────│  ┌──────────────────┐  │ │
│  │          │  结果回传       │  │ RBush R-Tree     │  │ │
│  └──────────┘                │  │ Geometry Compiler│  │ │
│                              │  │ GeoJSON Builder  │  │ │
│                              │  └──────────────────┘  │ │
│                              └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Worker 通信协议 (Message Protocol)

采用请求-响应模式，所有消息携带 `requestId` 用于异步匹配：

```typescript
/** 主线程 → Worker 的消息类型 */
type WorkerRequest =
  | { type: 'INIT_INDEX'; requestId: string; entities: SerializedEntity[] }
  | { type: 'UPDATE_INDEX'; requestId: string; added: SerializedEntity[]; removed: string[]; updated: SerializedEntity[] }
  | { type: 'HIT_TEST'; requestId: string; point: [number, number]; radius: number; zoom: number }
  | { type: 'RECT_SELECT'; requestId: string; bbox: [number, number, number, number] }
  | { type: 'COMPILE_GEOMETRY'; requestId: string; entityId: string; params: GeometryParams }
  | { type: 'BATCH_COMPILE'; requestId: string; entityIds: string[] }
  | { type: 'NEAREST_SNAP'; requestId: string; point: [number, number]; snapTypes: MapEntity['entityType'][] };

/** Worker → 主线程的消息类型 */
type WorkerResponse =
  | { type: 'INIT_COMPLETE'; requestId: string; featureCollection: GeoJSON.FeatureCollection }
  | { type: 'INDEX_UPDATED'; requestId: string }
  | { type: 'HIT_RESULT'; requestId: string; hits: Array<{ id: string; entityType: string; distance: number }> }
  | { type: 'RECT_RESULT'; requestId: string; ids: string[] }
  | { type: 'GEOMETRY_COMPILED'; requestId: string; entityId: string; geojson: GeoJSON.Feature }
  | { type: 'BATCH_COMPILED'; requestId: string; featureCollection: GeoJSON.FeatureCollection }
  | { type: 'SNAP_RESULT'; requestId: string; snapPoint: [number, number] | null; snapEntityId: string | null };
```

### 7.3 R-Tree 空间索引策略

```typescript
/** RBush 节点结构 */
interface SpatialIndexItem {
  minX: number; minY: number;
  maxX: number; maxY: number;
  id: string;
  entityType: MapEntity['entityType'];
}
```

* **初始化：** 导入地图时，Worker 遍历所有实体，计算 AABB 包围盒后批量 `rbush.load()` 一次性构建。
* **增量更新：** 编辑操作仅 `remove` + `insert` 受影响的单个节点，不重建整棵树。
* **碰撞检测流程：**
  1. 鼠标坐标 → 以像素容差换算为经纬度半径的搜索矩形
  2. `rbush.search(bbox)` 获取候选集（粗筛，通常 < 10 个）
  3. 对候选集逐一做精确几何距离计算（点到多边形/线段距离）
  4. 按距离排序，返回最近命中

### 7.4 参数化几何编译管线 (Geometry Compiler)

将存储层的参数化数据编译为渲染层所需的 GeoJSON Feature：

```
参数化实体 → Geometry Compiler → GeoJSON Feature
```

各实体类型的编译规则：

| 实体类型 | 输入参数 | 编译输出 |
|---------|---------|---------|
| Lane | centralCurve + leftSamples + rightSamples | `Polygon`（左右边界围合） + `LineString`（中心线） |
| Junction | polygon.points | `Polygon` |
| ParkingSpace | polygon.points + heading | `Polygon` + heading 属性 |
| Signal | boundary.points + subsignal locations | `Polygon` + `MultiPoint` |
| Crosswalk | polygon.points | `Polygon`（斑马线条纹由样式层处理） |
| StopSign | position + stopLines | `Point` + `MultiLineString` |
| SpeedBump | position curves | `MultiLineString` |

```typescript
/** 编译器入口 */
function compileEntity(entity: MapEntity): GeoJSON.Feature {
  switch (entity.entityType) {
    case 'lane': return compileLane(entity);
    case 'junction': return compileJunction(entity);
    case 'parkingSpace': return compileParkingSpace(entity);
    // ...
  }
}

/** 车道编译示例 —— 从中心线 + 宽度采样生成多边形 */
function compileLane(lane: LaneEntity): GeoJSON.Feature<GeoJSON.Polygon> {
  const centerPoints = flattenCurve(lane.centralCurve);
  const leftOffsets = interpolateWidths(lane.leftSamples, lane.length);
  const rightOffsets = interpolateWidths(lane.rightSamples, lane.length);

  const leftEdge = offsetPolyline(centerPoints, leftOffsets, 'left');
  const rightEdge = offsetPolyline(centerPoints, rightOffsets, 'right');

  // 左边界正序 + 右边界逆序 → 闭合多边形
  const ring = [...leftEdge, ...rightEdge.reverse(), leftEdge[0]];

  return {
    type: 'Feature',
    id: lane.id,
    properties: {
      entityType: 'lane',
      laneType: lane.type,
      turn: lane.turn,
      direction: lane.direction,
      speedLimit: lane.speedLimit,
    },
    geometry: { type: 'Polygon', coordinates: [ring.map(p => [p.x, p.y])] },
  };
}
```

### 7.5 Worker 生命周期管理

```typescript
class SpatialWorkerBridge {
  private worker: Worker;
  private pending: Map<string, { resolve: Function; reject: Function }>;
  private requestCounter = 0;

  constructor() {
    this.worker = new Worker(new URL('../core/workers/spatial.worker.ts', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.worker.onmessage = (e) => this.handleResponse(e.data);
  }

  /** 发送请求并返回 Promise */
  send<T extends WorkerResponse>(request: Omit<WorkerRequest, 'requestId'>): Promise<T> {
    const requestId = `req_${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ ...request, requestId });
    });
  }

  /** 销毁 Worker */
  dispose() {
    this.worker.terminate();
    this.pending.forEach(({ reject }) => reject(new Error('Worker terminated')));
    this.pending.clear();
  }
}
```

### 7.6 性能优化策略

* **Transferable Objects：** 大型 Float64Array 坐标数据通过 `postMessage(data, [buffer])` 零拷贝传输。
* **节流碰撞检测：** `HIT_TEST` 请求在主线程侧以 `requestAnimationFrame` 节流，确保每帧最多一次。
* **批量编译：** 初始化和视口变化时使用 `BATCH_COMPILE`，Worker 内部流式处理避免长任务阻塞。
* **编译缓存：** Worker 维护 `Map<string, GeoJSON.Feature>` 缓存，仅在实体参数变更时重新编译。

---

## 8. 交互控制器详细设计 (FSM Controller Specification)

### 8.1 设计原则

* **单一状态机统治所有交互：** 编辑器在任意时刻只处于一个明确状态，杜绝多个事件监听器竞争冲突。
* **事件拦截：** 全局拦截 MapLibre Canvas 上的 `mousedown / mousemove / mouseup / keydown / keyup / wheel / contextmenu`，由 FSM 按当前状态决定如何处理。
* **动作与副作用分离：** FSM 的 `actions` 仅负责派发指令（更新 Store、调用 Worker、操作热层），不直接操作 DOM。

### 8.2 状态图总览 (State Chart)

```
                          ┌─────────────────────────────────────────┐
                          │              EDITOR (root)              │
                          │                                         │
  ┌───────────┐  click    │  ┌─────────┐  dblclick   ┌──────────┐  │
  │           │ on empty  │  │         │ on lane     │          │  │
  │   IDLE    │◄──────────┼──│ SELECT  │────────────→│EDIT_CURVE│  │
  │           │───────────┼─→│         │             │          │  │
  └─────┬─────┘ hit_test  │  └────┬────┘             └────┬─────┘  │
        │      hit        │       │                       │        │
        │                 │       │ drag handle            │ Escape │
        │ toolbar         │       ▼                       ▼        │
        │ select tool     │  ┌─────────┐           ┌──────────┐   │
        ▼                 │  │DRAGGING │           │          │   │
  ┌───────────┐           │  │         │           │  (back   │   │
  │DRAW_LANE  │           │  └─────────┘           │  to      │   │
  │DRAW_SPOT  │           │                        │  SELECT) │   │
  │DRAW_SIGNAL│           │  ┌─────────┐           └──────────┘   │
  │DRAW_CROSS │           │  │ROTATING │                          │
  │DRAW_STOP  │           │  │         │                          │
  └───────────┘           │  └─────────┘                          │
                          └─────────────────────────────────────────┘
```

### 8.3 状态定义

```typescript
/** 编辑器顶层状态 */
type EditorState =
  | 'idle'           // 空闲，可平移/缩放地图
  | 'select'         // 已选中实体，显示控制柄
  | 'dragging'       // 拖拽移动选中实体
  | 'rotating'       // 拖拽旋转控制柄
  | 'resizing'       // 拖拽缩放控制柄
  | 'editCurve'      // 编辑车道曲线控制点
  | 'drawLane'       // 绘制车道模式
  | 'drawParkingSpot'// 绘制车位模式
  | 'drawSignal'     // 放置信号灯模式
  | 'drawCrosswalk'  // 绘制人行横道模式
  | 'drawStopSign'   // 放置停车标志模式
  | 'drawJunction'   // 绘制路口多边形模式
  | 'rectSelect';    // 框选模式

/** 绘制子状态 (适用于所有 draw* 状态) */
type DrawSubState =
  | 'placingFirst'   // 等待放置第一个点
  | 'drawing'        // 已有至少一个点，持续追加
  | 'preview';       // 预览即将完成的图形
```

### 8.4 事件类型

```typescript
type EditorEvent =
  // 鼠标事件 (坐标已转换为 [lng, lat])
  | { type: 'MOUSE_DOWN'; point: [number, number]; pixel: [number, number]; button: 0 | 1 | 2 }
  | { type: 'MOUSE_MOVE'; point: [number, number]; pixel: [number, number] }
  | { type: 'MOUSE_UP'; point: [number, number]; pixel: [number, number] }
  | { type: 'DOUBLE_CLICK'; point: [number, number] }
  | { type: 'CONTEXT_MENU'; point: [number, number]; pixel: [number, number] }

  // 键盘事件
  | { type: 'KEY_DOWN'; key: string; ctrl: boolean; shift: boolean; alt: boolean }
  | { type: 'KEY_UP'; key: string }

  // 碰撞检测结果 (来自 Worker)
  | { type: 'HIT_RESULT'; hits: Array<{ id: string; entityType: string; distance: number }> }

  // 工具栏指令
  | { type: 'SELECT_TOOL'; tool: 'select' | 'drawLane' | 'drawParkingSpot' | 'drawSignal' | 'drawCrosswalk' | 'drawStopSign' | 'drawJunction' }

  // 通用
  | { type: 'CANCEL' }   // Escape 键
  | { type: 'CONFIRM' }  // Enter 键
  | { type: 'DELETE' }   // Delete/Backspace 键
  | { type: 'UNDO' }
  | { type: 'REDO' };
```

### 8.5 核心状态转换表

| 当前状态 | 事件 | 守卫条件 | 目标状态 | 动作 |
|---------|------|---------|---------|------|
| `idle` | `MOUSE_DOWN` | hitTest 命中实体 | `select` | 设置 selectedIds，显示控制柄 |
| `idle` | `SELECT_TOOL(draw*)` | — | `draw*` | 切换光标样式，初始化绘制上下文 |
| `select` | `MOUSE_DOWN` | 命中控制柄(move) | `dragging` | 记录拖拽起点 |
| `select` | `MOUSE_DOWN` | 命中控制柄(rotate) | `rotating` | 记录旋转中心与初始角度 |
| `select` | `MOUSE_DOWN` | 命中控制柄(resize) | `resizing` | 记录缩放锚点 |
| `select` | `DOUBLE_CLICK` | 选中实体为 Lane | `editCurve` | 加载曲线控制点到热层 |
| `select` | `MOUSE_DOWN` | hitTest 未命中 | `idle` | 清空 selectedIds |
| `select` | `DELETE` | — | `idle` | 删除选中实体 |
| `dragging` | `MOUSE_MOVE` | — | `dragging` | 实时更新热层位置 |
| `dragging` | `MOUSE_UP` | — | `select` | 落盘到 Store，生成 Zundo 快照 |
| `rotating` | `MOUSE_MOVE` | — | `rotating` | 计算角度差，实时更新热层 |
| `rotating` | `MOUSE_UP` | — | `select` | 落盘角度到 Store |
| `resizing` | `MOUSE_MOVE` | — | `resizing` | 计算缩放比，实时更新热层 |
| `resizing` | `MOUSE_UP` | — | `select` | 落盘尺寸到 Store |
| `editCurve` | `MOUSE_DOWN` | 命中控制点 | `editCurve` | 开始拖拽控制点 |
| `editCurve` | `MOUSE_DOWN` | 命中曲线段 | `editCurve` | 在命中位置插入新控制点 |
| `editCurve` | `CANCEL` | — | `select` | 退出曲线编辑 |
| `draw*` | `MOUSE_DOWN` | — | `draw*` | 追加控制点 |
| `draw*` | `MOUSE_MOVE` | — | `draw*` | 更新预览几何 |
| `draw*` | `DOUBLE_CLICK` / `CONFIRM` | 点数 ≥ 最小值 | `idle` | 创建实体，落盘到 Store |
| `draw*` | `CANCEL` | — | `idle` | 丢弃绘制中的数据 |
| `*` | `UNDO` | — | `*` | 调用 Zundo undo() |
| `*` | `REDO` | — | `*` | 调用 Zundo redo() |

### 8.6 XState Machine 配置骨架

```typescript
import { setup, assign } from 'xstate';

interface EditorContext {
  selectedIds: Set<string>;
  hoveredId: string | null;
  dragOrigin: [number, number] | null;
  rotateCenter: [number, number] | null;
  rotateStartAngle: number;
  drawPoints: Array<[number, number]>;
  activeTool: string;
  activeHandleType: 'move' | 'rotate' | 'resize' | null;
}

const editorMachine = setup({
  types: {
    context: {} as EditorContext,
    events: {} as EditorEvent,
  },
  guards: {
    hasHit: ({ event }) => event.type === 'HIT_RESULT' && event.hits.length > 0,
    hitIsHandle: ({ context, event }) => /* 判断命中的是控制柄 */ true,
    hitIsEntity: ({ context, event }) => /* 判断命中的是实体本体 */ true,
    isLaneSelected: ({ context }) => /* 当前选中实体为 Lane */ true,
    minPointsReached: ({ context }) => context.drawPoints.length >= 2,
  },
  actions: {
    setSelection: assign({ /* ... */ }),
    clearSelection: assign({ selectedIds: new Set(), hoveredId: null }),
    startDrag: assign({ /* 记录拖拽起点 */ }),
    updateHotLayer: ({ context, event }) => { /* 直接调用 map.getSource().setData() */ },
    commitToStore: ({ context }) => { /* 将变更写入 Zustand Store */ },
    createEntity: ({ context }) => { /* 从 drawPoints 创建新实体 */ },
    deleteSelected: ({ context }) => { /* 从 Store 删除选中实体 */ },
  },
}).createMachine({
  id: 'editor',
  initial: 'idle',
  context: {
    selectedIds: new Set(),
    hoveredId: null,
    dragOrigin: null,
    rotateCenter: null,
    rotateStartAngle: 0,
    drawPoints: [],
    activeTool: 'select',
    activeHandleType: null,
  },
  states: {
    idle: { /* 状态转换定义 */ },
    select: { /* 状态转换定义 */ },
    dragging: { /* 状态转换定义 */ },
    rotating: { /* 状态转换定义 */ },
    resizing: { /* 状态转换定义 */ },
    editCurve: { /* 状态转换定义 */ },
    drawLane: { /* 状态转换定义 */ },
    drawParkingSpot: { /* 状态转换定义 */ },
    drawSignal: { /* 状态转换定义 */ },
    drawCrosswalk: { /* 状态转换定义 */ },
    drawStopSign: { /* 状态转换定义 */ },
    drawJunction: { /* 状态转换定义 */ },
    rectSelect: { /* 状态转换定义 */ },
  },
});
```

### 8.7 事件拦截层 (Event Interceptor)

```typescript
/** 挂载到 MapLibre Canvas 的事件拦截器 */
function attachEventInterceptor(map: maplibregl.Map, send: (event: EditorEvent) => void) {
  const canvas = map.getCanvas();

  // 统一坐标转换
  const toMapPoint = (e: MouseEvent): [number, number] => {
    const lngLat = map.unproject([e.offsetX, e.offsetY]);
    return [lngLat.lng, lngLat.lat];
  };

  canvas.addEventListener('mousedown', (e) => {
    send({ type: 'MOUSE_DOWN', point: toMapPoint(e), pixel: [e.offsetX, e.offsetY], button: e.button as 0 | 1 | 2 });
  });

  canvas.addEventListener('mousemove', (e) => {
    send({ type: 'MOUSE_MOVE', point: toMapPoint(e), pixel: [e.offsetX, e.offsetY] });
  });

  canvas.addEventListener('mouseup', (e) => {
    send({ type: 'MOUSE_UP', point: toMapPoint(e), pixel: [e.offsetX, e.offsetY] });
  });

  canvas.addEventListener('dblclick', (e) => {
    e.preventDefault(); // 阻止 MapLibre 默认的双击缩放
    send({ type: 'DOUBLE_CLICK', point: toMapPoint(e) });
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    send({ type: 'CONTEXT_MENU', point: toMapPoint(e), pixel: [e.offsetX, e.offsetY] });
  });

  // 键盘事件挂载到 window (确保焦点不在输入框时生效)
  window.addEventListener('keydown', (e) => {
    if (isInputFocused()) return;
    if (e.key === 'Escape') send({ type: 'CANCEL' });
    else if (e.key === 'Enter') send({ type: 'CONFIRM' });
    else if (e.key === 'Delete' || e.key === 'Backspace') send({ type: 'DELETE' });
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) send({ type: 'UNDO' });
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) send({ type: 'REDO' });
    else send({ type: 'KEY_DOWN', key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
  });
}
```

### 8.8 快捷键绑定表

| 快捷键 | 动作 | 适用状态 |
|--------|------|---------|
| `Escape` | 取消当前操作 / 退出绘制模式 | 全局 |
| `Enter` | 确认绘制 / 完成编辑 | draw*, editCurve |
| `Delete` / `Backspace` | 删除选中实体 | select |
| `Ctrl+Z` | 撤销 | 全局 |
| `Ctrl+Shift+Z` | 重做 | 全局 |
| `V` | 切换到选择工具 | 全局 |
| `L` | 切换到绘制车道 | idle |
| `P` | 切换到绘制车位 | idle |
| `S` | 切换到绘制信号灯 | idle |
| `C` | 切换到绘制人行横道 | idle |
| `Ctrl+A` | 全选当前图层 | idle, select |
| `Ctrl+D` | 取消选择 | select |
| `Shift+Click` | 多选追加 | idle, select |

---

## 9. 渲染层详细设计 (Rendering Layer Specification)

### 9.1 动静分离核心策略

渲染层严格划分为两个通道，确保十万级要素下的 60fps 交互：

```
┌──────────────────────────────────────────────────────────────┐
│  MapLibre GL 渲染管线                                         │
│                                                              │
│  ┌─────────────────────────────────┐  geojson-vt 实时切片     │
│  │  冷层 (Cold Layer)              │◄─── 全量 FeatureCollection│
│  │  vector-tile source             │     (Worker 编译输出)     │
│  │  十万级要素，静默渲染             │                          │
│  └─────────────────────────────────┘                          │
│                                                              │
│  ┌─────────────────────────────────┐  setData() 直接更新      │
│  │  热层 (Hot Layer)               │◄─── 单个/少量 Feature     │
│  │  geojson source                 │     (FSM 实时推演)        │
│  │  当前编辑中的要素 + 控制柄        │                          │
│  └─────────────────────────────────┘                          │
│                                                              │
│  ┌─────────────────────────────────┐                          │
│  │  叠加层 (Overlay Layer)         │◄─── 光标、辅助线、标注     │
│  │  geojson source                 │                          │
│  └─────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Source 配置

```typescript
/** 冷层 —— 矢量瓦片 Source */
const COLD_SOURCE: maplibregl.SourceSpecification = {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  // geojson-vt 参数：启用实时矢量切片
  maxzoom: 18,
  tolerance: 0.5,       // 简化容差 (像素)
  buffer: 64,           // 瓦片缓冲区 (像素)
  generateId: true,     // 自动生成 feature id 用于 feature-state
};

/** 热层 —— 实时 GeoJSON Source */
const HOT_SOURCE: maplibregl.SourceSpecification = {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
};

/** 叠加层 —— 辅助图形 Source */
const OVERLAY_SOURCE: maplibregl.SourceSpecification = {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
};
```

### 9.3 Layer 配置与渲染优先级

图层按 z-order 从底到顶排列：

```typescript
const LAYER_REGISTRY: LayerConfig[] = [
  // ═══════════ 冷层 (Cold) ═══════════
  // z=0: 道路填充
  {
    id: 'cold-road-fill',
    source: 'cold',
    type: 'fill',
    filter: ['==', ['get', 'entityType'], 'road'],
    paint: {
      'fill-color': '#2a2a3e',
      'fill-opacity': 0.3,
    },
  },
  // z=1: 路口填充
  {
    id: 'cold-junction-fill',
    source: 'cold',
    type: 'fill',
    filter: ['==', ['get', 'entityType'], 'junction'],
    paint: {
      'fill-color': '#3a3a5e',
      'fill-opacity': 0.4,
    },
  },
  // z=2: 车道多边形填充
  {
    id: 'cold-lane-fill',
    source: 'cold',
    type: 'fill',
    filter: ['==', ['get', 'entityType'], 'lane'],
    paint: {
      'fill-color': [
        'match', ['get', 'laneType'],
        'CITY_DRIVING', '#4a6fa5',
        'BIKING', '#6fa54a',
        'SIDEWALK', '#a5a54a',
        'PARKING', '#a54a6f',
        /* default */ '#555577',
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 0.7,
        0.4,
      ],
    },
  },
  // z=3: 车道边界线
  {
    id: 'cold-lane-boundary',
    source: 'cold',
    type: 'line',
    filter: ['==', ['get', 'entityType'], 'laneBoundary'],
    paint: {
      'line-color': [
        'match', ['get', 'boundaryType'],
        'SOLID_WHITE', '#ffffff',
        'DOTTED_WHITE', '#ffffff',
        'SOLID_YELLOW', '#ffcc00',
        'DOTTED_YELLOW', '#ffcc00',
        'DOUBLE_YELLOW', '#ffcc00',
        'CURB', '#888888',
        /* default */ '#666666',
      ],
      'line-width': 2,
      'line-dasharray': [
        'match', ['get', 'boundaryType'],
        'DOTTED_WHITE', ['literal', [2, 4]],
        'DOTTED_YELLOW', ['literal', [2, 4]],
        /* default */ ['literal', [1, 0]],
      ],
    },
  },
  // z=4: 人行横道
  {
    id: 'cold-crosswalk-fill',
    source: 'cold',
    type: 'fill',
    filter: ['==', ['get', 'entityType'], 'crosswalk'],
    paint: {
      'fill-color': '#ffffff',
      'fill-opacity': 0.5,
      'fill-pattern': 'zebra-stripe', // 需预加载斑马线图案
    },
  },
  // z=5: 车位
  {
    id: 'cold-parking-fill',
    source: 'cold',
    type: 'fill',
    filter: ['==', ['get', 'entityType'], 'parkingSpace'],
    paint: {
      'fill-color': '#7c5cbf',
      'fill-opacity': 0.4,
    },
  },
  // z=6: 车位边框
  {
    id: 'cold-parking-outline',
    source: 'cold',
    type: 'line',
    filter: ['==', ['get', 'entityType'], 'parkingSpace'],
    paint: {
      'line-color': '#9b7fd4',
      'line-width': 1.5,
    },
  },
  // z=7: 信号灯
  {
    id: 'cold-signal-icon',
    source: 'cold',
    type: 'symbol',
    filter: ['==', ['get', 'entityType'], 'signal'],
    layout: {
      'icon-image': 'signal-icon',
      'icon-size': 0.8,
      'icon-allow-overlap': true,
    },
  },
  // z=8: 停车标志
  {
    id: 'cold-stopsign-icon',
    source: 'cold',
    type: 'symbol',
    filter: ['==', ['get', 'entityType'], 'stopSign'],
    layout: {
      'icon-image': 'stopsign-icon',
      'icon-size': 0.7,
      'icon-allow-overlap': true,
    },
  },

  // ═══════════ 热层 (Hot) ═══════════
  // z=100: 选中实体高亮填充
  {
    id: 'hot-fill',
    source: 'hot',
    type: 'fill',
    paint: {
      'fill-color': '#00aaff',
      'fill-opacity': 0.3,
    },
  },
  // z=101: 选中实体高亮边框
  {
    id: 'hot-outline',
    source: 'hot',
    type: 'line',
    paint: {
      'line-color': '#00ccff',
      'line-width': 2.5,
    },
  },
  // z=102: 曲线编辑 —— 控制点
  {
    id: 'hot-control-points',
    source: 'hot',
    type: 'circle',
    filter: ['==', ['get', 'role'], 'controlPoint'],
    paint: {
      'circle-radius': 6,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#00aaff',
      'circle-stroke-width': 2,
    },
  },

  // ═══════════ 叠加层 (Overlay) ═══════════
  // z=200: 绘制预览线
  {
    id: 'overlay-draw-line',
    source: 'overlay',
    type: 'line',
    filter: ['==', ['get', 'role'], 'drawPreview'],
    paint: {
      'line-color': '#ff6600',
      'line-width': 2,
      'line-dasharray': [4, 4],
    },
  },
  // z=201: 吸附辅助点
  {
    id: 'overlay-snap-point',
    source: 'overlay',
    type: 'circle',
    filter: ['==', ['get', 'role'], 'snapPoint'],
    paint: {
      'circle-radius': 8,
      'circle-color': '#ff6600',
      'circle-opacity': 0.6,
    },
  },
];
```

### 9.4 冷层更新策略

```typescript
/** 冷层数据更新流程 */
class ColdLayerManager {
  private map: maplibregl.Map;
  private workerBridge: SpatialWorkerBridge;

  /**
   * 全量刷新 —— 仅在以下场景触发：
   * 1. 地图文件导入
   * 2. 批量编辑完成
   */
  async fullRefresh(entities: MapEntity[]) {
    const result = await this.workerBridge.send<BatchCompiledResponse>({
      type: 'BATCH_COMPILE',
      entityIds: entities.map(e => e.id),
    });
    (this.map.getSource('cold') as maplibregl.GeoJSONSource).setData(result.featureCollection);
  }

  /**
   * 增量刷新 —— 单个实体编辑完成后：
   * 1. Worker 重新编译该实体
   * 2. 替换 FeatureCollection 中对应 Feature
   * 3. setData() 更新冷层
   *
   * 注意：geojson-vt 会自动增量切片，性能开销可控
   */
  async incrementalUpdate(entityId: string) {
    const result = await this.workerBridge.send<GeometryCompiledResponse>({
      type: 'COMPILE_GEOMETRY',
      entityId,
      params: {} as GeometryParams,
    });
    this.replaceFeature(entityId, result.geojson);
  }
}
```

### 9.5 热层实时更新策略

```typescript
/** 热层管理 —— 绕过 React，直接操作 MapLibre Source */
class HotLayerManager {
  private map: maplibregl.Map;
  private currentFeatures: GeoJSON.Feature[] = [];

  /** 选中实体时：从冷层提取 Feature 到热层 */
  showSelection(features: GeoJSON.Feature[]) {
    this.currentFeatures = features;
    this.flush();
  }

  /** 拖拽/旋转/缩放过程中：直接替换热层数据 (每帧调用) */
  updateLive(features: GeoJSON.Feature[]) {
    this.currentFeatures = features;
    this.flush();
  }

  /** 清空热层 */
  clear() {
    this.currentFeatures = [];
    this.flush();
  }

  private flush() {
    const source = this.map.getSource('hot') as maplibregl.GeoJSONSource;
    source.setData({
      type: 'FeatureCollection',
      features: this.currentFeatures,
    });
  }
}
```

### 9.6 Feature-State 悬停高亮

利用 MapLibre 的 `feature-state` 实现零开销悬停效果（不修改 Source 数据）：

```typescript
/** 悬停高亮控制器 */
class HoverController {
  private hoveredFeatureId: string | number | null = null;

  onHoverChange(map: maplibregl.Map, featureId: string | number | null) {
    // 清除旧高亮
    if (this.hoveredFeatureId !== null) {
      map.setFeatureState(
        { source: 'cold', id: this.hoveredFeatureId },
        { hover: false }
      );
    }
    // 设置新高亮
    if (featureId !== null) {
      map.setFeatureState(
        { source: 'cold', id: featureId },
        { hover: true }
      );
    }
    this.hoveredFeatureId = featureId;
  }
}
```

### 9.7 控制柄渲染 (Handle Rendering)

选中实体后，在热层叠加渲染变换控制柄：

```typescript
/** 生成控制柄 GeoJSON Features */
function generateHandles(entity: MapEntity, bbox: BBox): GeoJSON.Feature[] {
  const [minX, minY, maxX, maxY] = bbox;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return [
    // 四角缩放柄
    point([minX, minY], { role: 'handle', handleType: 'resize', cursor: 'nwse-resize' }),
    point([maxX, minY], { role: 'handle', handleType: 'resize', cursor: 'nesw-resize' }),
    point([maxX, maxY], { role: 'handle', handleType: 'resize', cursor: 'nwse-resize' }),
    point([minX, maxY], { role: 'handle', handleType: 'resize', cursor: 'nesw-resize' }),
    // 顶部旋转柄
    point([cx, maxY + ROTATE_HANDLE_OFFSET], { role: 'handle', handleType: 'rotate', cursor: 'grab' }),
    // 中心移动柄
    point([cx, cy], { role: 'handle', handleType: 'move', cursor: 'move' }),
  ];
}
```

---

## 10. 应用 UI 层详细设计 (App UI Specification)

### 10.1 整体布局 (IDE 风格)

采用 `react-resizable-panels` 实现可拖拽分栏的桌面级布局：

```
┌──────────────────────────────────────────────────────────────┐
│  顶部工具栏 (Toolbar)                                  48px  │
├────────┬─────────────────────────────────┬───────────────────┤
│        │                                 │                   │
│ 图层树  │      地图画布 (MapCanvas)        │   属性面板        │
│ 面板   │                                 │   (Properties)    │
│        │                                 │                   │
│ 240px  │         flex: 1                 │   320px           │
│ min120 │                                 │   min200          │
│        │                                 │                   │
├────────┴─────────────────────────────────┴───────────────────┤
│  底部状态栏 (StatusBar)                                24px  │
└──────────────────────────────────────────────────────────────┘
```

```typescript
// components/layout/EditorLayout.tsx
function EditorLayout() {
  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100">
      <Toolbar />
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={15} minSize={8} maxSize={25}>
          <LayerTree />
        </Panel>
        <PanelResizeHandle className="w-1 bg-zinc-700 hover:bg-blue-500 transition-colors" />
        <Panel defaultSize={60}>
          <MapCanvas />
        </Panel>
        <PanelResizeHandle className="w-1 bg-zinc-700 hover:bg-blue-500 transition-colors" />
        <Panel defaultSize={25} minSize={15} maxSize={35}>
          <PropertiesPanel />
        </Panel>
      </PanelGroup>
      <StatusBar />
    </div>
  );
}
```

### 10.2 工具栏 (Toolbar)

```typescript
interface ToolbarItem {
  id: string;
  icon: React.ComponentType;
  label: string;
  shortcut: string;
  tool: EditorEvent['type'] extends 'SELECT_TOOL' ? string : never;
  group: 'select' | 'draw' | 'edit' | 'file';
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  // 选择组
  { id: 'select', icon: CursorIcon, label: '选择', shortcut: 'V', tool: 'select', group: 'select' },

  // 绘制组
  { id: 'drawLane', icon: LaneIcon, label: '车道', shortcut: 'L', tool: 'drawLane', group: 'draw' },
  { id: 'drawParkingSpot', icon: ParkingIcon, label: '车位', shortcut: 'P', tool: 'drawParkingSpot', group: 'draw' },
  { id: 'drawSignal', icon: SignalIcon, label: '信号灯', shortcut: 'S', tool: 'drawSignal', group: 'draw' },
  { id: 'drawCrosswalk', icon: CrosswalkIcon, label: '人行横道', shortcut: 'C', tool: 'drawCrosswalk', group: 'draw' },
  { id: 'drawStopSign', icon: StopSignIcon, label: '停车标志', shortcut: 'T', tool: 'drawStopSign', group: 'draw' },
  { id: 'drawJunction', icon: JunctionIcon, label: '路口', shortcut: 'J', tool: 'drawJunction', group: 'draw' },

  // 文件组
  { id: 'import', icon: ImportIcon, label: '导入', shortcut: 'Ctrl+O', tool: '', group: 'file' },
  { id: 'export', icon: ExportIcon, label: '导出', shortcut: 'Ctrl+S', tool: '', group: 'file' },
];
```

工具栏使用 Radix `ToggleGroup` 实现互斥选中，绘制工具组与选择工具互斥。

### 10.3 图层树面板 (Layer Tree)

```typescript
/** 图层树节点 */
interface LayerTreeNode {
  entityType: MapEntity['entityType'];
  label: string;
  icon: React.ComponentType;
  count: number;        // 该类型实体数量
  visible: boolean;     // 图层可见性
  locked: boolean;      // 图层锁定 (锁定后不可选中/编辑)
  color: string;        // 图层标识色
}

const LAYER_ORDER: LayerTreeNode['entityType'][] = [
  'road', 'junction', 'lane', 'crosswalk',
  'parkingSpace', 'signal', 'stopSign', 'speedBump',
];
```

功能：
* 点击眼睛图标切换图层可见性 → 更新 `UIStore.layerVisibility` → MapLibre `setLayoutProperty('visibility')`
* 点击锁图标切换图层锁定 → 锁定的图层在 hitTest 中被过滤
* 拖拽排序调整图层渲染优先级
* 显示各类型实体计数

### 10.4 属性面板 (Properties Panel)

选中实体后，右侧面板展示并编辑其属性。采用 `react-hook-form` + `zod` 实现类型安全的表单验证：

```typescript
/** 根据实体类型动态渲染对应的属性表单 */
function PropertiesPanel() {
  const selectedIds = useUIStore(s => s.selectedIds);
  const entity = useMapStore(s =>
    selectedIds.size === 1 ? s.getEntity(selectedIds.values().next().value) : null
  );

  if (!entity) return <EmptyState message="选择一个要素以查看属性" />;
  if (selectedIds.size > 1) return <MultiSelectInfo count={selectedIds.size} />;

  switch (entity.entityType) {
    case 'lane': return <LaneForm entity={entity} />;
    case 'junction': return <JunctionForm entity={entity} />;
    case 'parkingSpace': return <ParkingSpaceForm entity={entity} />;
    case 'signal': return <SignalForm entity={entity} />;
    case 'crosswalk': return <CrosswalkForm entity={entity} />;
    case 'stopSign': return <StopSignForm entity={entity} />;
    default: return <GenericForm entity={entity} />;
  }
}
```

#### 10.4.1 车道属性表单示例

```typescript
const laneSchema = z.object({
  type: z.enum(['NONE', 'CITY_DRIVING', 'BIKING', 'SIDEWALK', 'PARKING', 'SHOULDER']),
  turn: z.enum(['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN']),
  direction: z.enum(['FORWARD', 'BACKWARD', 'BIDIRECTION']),
  speedLimit: z.number().min(0).max(200),
  length: z.number().min(0).readonly(),
});

function LaneForm({ entity }: { entity: LaneEntity }) {
  const updateEntity = useMapStore(s => s.updateEntity);
  const form = useForm({
    resolver: zodResolver(laneSchema),
    defaultValues: {
      type: entity.type,
      turn: entity.turn,
      direction: entity.direction,
      speedLimit: entity.speedLimit,
      length: entity.length,
    },
  });

  // 表单变更实时同步到 Store
  useEffect(() => {
    const subscription = form.watch((values) => {
      updateEntity(entity.id, values);
    });
    return () => subscription.unsubscribe();
  }, [entity.id]);

  return (
    <Form {...form}>
      <FormSection title="基本属性">
        <SelectField name="type" label="车道类型" options={LANE_TYPE_OPTIONS} />
        <SelectField name="turn" label="转向" options={LANE_TURN_OPTIONS} />
        <SelectField name="direction" label="方向" options={LANE_DIRECTION_OPTIONS} />
        <NumberField name="speedLimit" label="限速 (km/h)" step={5} />
        <ReadonlyField name="length" label="长度 (m)" />
      </FormSection>

      <FormSection title="拓扑关系">
        <EntityRefList label="前驱车道" ids={entity.predecessorIds} />
        <EntityRefList label="后继车道" ids={entity.successorIds} />
        <EntityRef label="所属路口" id={entity.junctionId} />
      </FormSection>
    </Form>
  );
}
```

### 10.5 底部状态栏 (Status Bar)

```typescript
function StatusBar() {
  const editorMode = useUIStore(s => s.editorMode);
  const selectedCount = useUIStore(s => s.selectedIds.size);
  const entityCount = useMapStore(s => s.entities.size);
  const viewport = useUIStore(s => s.viewport);

  return (
    <div className="h-6 px-3 flex items-center gap-4 bg-zinc-800 text-zinc-400 text-xs border-t border-zinc-700">
      <span>模式: {MODE_LABELS[editorMode]}</span>
      <span>选中: {selectedCount}</span>
      <span>要素: {entityCount}</span>
      <span>缩放: {viewport.zoom.toFixed(1)}</span>
      <span>坐标: {viewport.center[0].toFixed(6)}, {viewport.center[1].toFixed(6)}</span>
    </div>
  );
}
```

### 10.6 右键菜单 (Context Menu)

使用 Radix `ContextMenu` 组件，根据当前状态和命中目标动态生成菜单项：

```typescript
const CONTEXT_MENU_ITEMS: Record<string, ContextMenuItem[]> = {
  idle: [
    { label: '粘贴', shortcut: 'Ctrl+V', action: 'PASTE' },
    { label: '全选', shortcut: 'Ctrl+A', action: 'SELECT_ALL' },
  ],
  select: [
    { label: '复制', shortcut: 'Ctrl+C', action: 'COPY' },
    { label: '删除', shortcut: 'Delete', action: 'DELETE' },
    { separator: true },
    { label: '编辑曲线', action: 'EDIT_CURVE', guard: 'isLane' },
    { label: '查看拓扑', action: 'SHOW_TOPOLOGY' },
    { separator: true },
    { label: '属性', action: 'SHOW_PROPERTIES' },
  ],
};
```

### 10.7 导入/导出流程

```
导入: .bin (protobuf) → protobufjs 解码 → 转换为 MapEntity[] → Store.importFromApollo()
                                                                    ↓
                                                              Worker.INIT_INDEX
                                                                    ↓
                                                              ColdLayer.fullRefresh()

导出: Store.entities → 转换为 Apollo proto 结构 → protobufjs 编码 → 下载 .bin 文件
```

```typescript
/** 导入 Apollo HD Map 二进制文件 */
async function importApolloMap(file: File) {
  const buffer = await file.arrayBuffer();
  const proto = ApolloMap.decode(new Uint8Array(buffer));
  const entities = convertProtoToEntities(proto);
  useMapStore.getState().importFromApollo(entities);
}

/** 导出为 Apollo HD Map 二进制文件 */
function exportApolloMap() {
  const entities = useMapStore.getState().entities;
  const proto = convertEntitiesToProto(entities);
  const buffer = ApolloMap.encode(proto).finish();
  downloadFile(buffer, 'map.bin', 'application/octet-stream');
}
```

---

## 11. 跨层数据流总览 (End-to-End Data Flow)

```
用户操作 (鼠标/键盘)
    │
    ▼
[事件拦截器] ──→ [XState FSM] ──→ 判断当前状态 & 派发动作
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              [热层直接更新]      [Worker 碰撞检测]    [Store 落盘]
              (拖拽中 60fps)     (hitTest/snap)      (mouseup 时)
                                        │                   │
                                        ▼                   ▼
                                  [FSM 接收结果]      [Zundo 快照]
                                  [更新选中态]        [冷层增量刷新]
                                                          │
                                                          ▼
                                                    [React 响应]
                                                    [属性面板更新]
```

## 12. 依赖清单 (Dependencies)

| 包名 | 版本 | 用途 |
|------|------|------|
| `react` | ^19.0 | UI 框架 |
| `react-dom` | ^19.0 | DOM 渲染 |
| `typescript` | ^5.7 | 类型系统 |
| `tailwindcss` | ^4.0 | 原子化 CSS |
| `@radix-ui/react-*` | latest | 无障碍 UI 原语 |
| `zustand` | ^5.0 | 状态管理 |
| `immer` | ^10.0 | 不可变更新 |
| `zundo` | ^2.0 | 撤销/重做 |
| `maplibre-gl` | ^5.0 | WebGL 地图渲染 |
| `xstate` | ^5.0 | 有限状态机 |
| `@turf/turf` | ^7.0 | 空间几何计算 |
| `rbush` | ^4.0 | R-Tree 空间索引 |
| `geojson-vt` | ^4.0 | GeoJSON 矢量切片 |
| `protobufjs` | ^7.0 | Protocol Buffers 编解码 |
| `nanoid` | ^5.0 | 轻量 ID 生成 |
| `react-resizable-panels` | ^2.0 | 可拖拽分栏布局 |
| `react-hook-form` | ^7.0 | 表单状态管理 |
| `zod` | ^3.0 | Schema 验证 |
| `@hookform/resolvers` | ^3.0 | zod ↔ react-hook-form 桥接 |
| `vite` | ^6.0 | 构建工具 |