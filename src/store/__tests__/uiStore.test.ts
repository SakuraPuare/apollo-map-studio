/**
 * uiStore — 编辑器 UI 状态层。
 *
 * 这个 store 是 ToolStrip / StatusBar / LayerPanel 的事实来源；
 * 它本身是纯 zustand（不持久化、不依赖 localStorage / window），
 * 所以可以直接在 node 环境跑而无需 jsdom。
 *
 * 测试策略：
 *   - 每个 it 通过 `useUIStore.setState(initialSnapshot, true)` 重置（true = replace）
 *   - 不 mock 业务核心
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';
import { useSettingsStore } from '../settingsStore';

// 在每个 it 前把 store 还原到模块初始态
const initialSnapshot = useUIStore.getState();
const initialSettingsSnapshot = useSettingsStore.getState();

beforeEach(() => {
  useUIStore.setState(initialSnapshot, true);
  useSettingsStore.setState(initialSettingsSnapshot, true);
});

describe('uiStore — 默认 state', () => {
  it('grid 默认开启（视觉默认）/ snap 默认关闭', () => {
    expect(useUIStore.getState().gridEnabled).toBe(true);
    expect(useUIStore.getState().snapEnabled).toBe(false);
  });

  it('appMode 默认 drawing，sidebar 默认可见', () => {
    expect(useUIStore.getState().appMode).toBe('drawing');
    expect(useUIStore.getState().sidebarVisible).toBe(true);
  });

  it('所有 13 种 entity 类型默认 visible / unlocked', () => {
    const types = [
      'lane',
      'junction',
      'parkingSpace',
      'signal',
      'crosswalk',
      'stopSign',
      'speedBump',
      'polyline',
      'catmullRom',
      'bezier',
      'arc',
      'rect',
      'polygon',
    ];
    const s = useUIStore.getState();
    for (const t of types) {
      expect(s.isLayerVisible(t)).toBe(true);
      expect(s.isLayerLocked(t)).toBe(false);
    }
  });

  it('cursorLngLat 默认 null，currentZoom 默认 18', () => {
    expect(useUIStore.getState().cursorLngLat).toBe(null);
    expect(useUIStore.getState().currentZoom).toBe(18);
  });
});

describe('uiStore — toggle actions', () => {
  it('toggleGrid 翻转 gridEnabled', () => {
    expect(useUIStore.getState().gridEnabled).toBe(true);
    useUIStore.getState().toggleGrid();
    expect(useUIStore.getState().gridEnabled).toBe(false);
    useUIStore.getState().toggleGrid();
    expect(useUIStore.getState().gridEnabled).toBe(true);
  });

  it('grid/snap toggles persist into settingsStore', () => {
    useUIStore.getState().toggleGrid();
    useUIStore.getState().toggleSnap();

    expect(useSettingsStore.getState().gridEnabled).toBe(false);
    expect(useSettingsStore.getState().snapEnabled).toBe(true);
  });

  it('setGridEnabled / setSnapEnabled update UI and settings together', () => {
    useUIStore.getState().setGridEnabled(false);
    useUIStore.getState().setSnapEnabled(true);

    expect(useUIStore.getState().gridEnabled).toBe(false);
    expect(useUIStore.getState().snapEnabled).toBe(true);
    expect(useSettingsStore.getState().gridEnabled).toBe(false);
    expect(useSettingsStore.getState().snapEnabled).toBe(true);
  });

  it('toggleSnap 翻转 snapEnabled，且不影响 gridEnabled', () => {
    const gridBefore = useUIStore.getState().gridEnabled;
    useUIStore.getState().toggleSnap();
    expect(useUIStore.getState().snapEnabled).toBe(true);
    expect(useUIStore.getState().gridEnabled).toBe(gridBefore);
  });

  it('toggleSidebar 翻转 sidebarVisible', () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarVisible).toBe(false);
  });

  it('toggleAppMode 在 drawing / scene 之间切换', () => {
    expect(useUIStore.getState().appMode).toBe('drawing');
    useUIStore.getState().toggleAppMode();
    expect(useUIStore.getState().appMode).toBe('scene');
    useUIStore.getState().toggleAppMode();
    expect(useUIStore.getState().appMode).toBe('drawing');
  });

  it('boundary brush stores selected boundary type and excludes connect mode', () => {
    const s = useUIStore.getState();
    expect(s.boundaryBrush).toEqual({ active: false, type: 'SOLID_WHITE' });

    s.toggleBoundaryBrush();
    expect(useUIStore.getState().boundaryBrush.active).toBe(true);

    useUIStore.getState().setBoundaryBrushType('CURB');
    expect(useUIStore.getState().boundaryBrush).toEqual({ active: true, type: 'CURB' });

    useUIStore.getState().toggleConnectMode();
    expect(useUIStore.getState().connectMode.active).toBe(true);
    expect(useUIStore.getState().boundaryBrush.active).toBe(false);
  });

  it('setAppMode 直接设值', () => {
    useUIStore.getState().setAppMode('scene');
    expect(useUIStore.getState().appMode).toBe('scene');
  });
});

describe('uiStore — layer state', () => {
  it('setLayerVisible 关闭某个图层而不影响别的', () => {
    const s = useUIStore.getState();
    s.setLayerVisible('lane', false);
    expect(useUIStore.getState().isLayerVisible('lane')).toBe(false);
    // 别的图层保持默认 visible
    expect(useUIStore.getState().isLayerVisible('crosswalk')).toBe(true);
  });

  it('setLayerLocked 锁定单个图层', () => {
    useUIStore.getState().setLayerLocked('signal', true);
    expect(useUIStore.getState().isLayerLocked('signal')).toBe(true);
  });

  it('toggleLayerVisible 在 visible/false 间翻转', () => {
    const s = useUIStore.getState();
    s.toggleLayerVisible('lane');
    expect(useUIStore.getState().isLayerVisible('lane')).toBe(false);
    s.toggleLayerVisible('lane');
    expect(useUIStore.getState().isLayerVisible('lane')).toBe(true);
  });

  it('toggleLayerLocked 翻转锁定态', () => {
    useUIStore.getState().toggleLayerLocked('lane');
    expect(useUIStore.getState().isLayerLocked('lane')).toBe(true);
  });

  it('未注册的 type 回退默认（visible=true / locked=false）', () => {
    const s = useUIStore.getState();
    expect(s.isLayerVisible('not-a-type')).toBe(true);
    expect(s.isLayerLocked('not-a-type')).toBe(false);
  });
});

describe('uiStore — viewport state', () => {
  it('setCursorLngLat 写入坐标', () => {
    useUIStore.getState().setCursorLngLat([116.4, 39.9]);
    expect(useUIStore.getState().cursorLngLat).toEqual([116.4, 39.9]);
  });

  it('setCursorLngLat(null) 清空坐标', () => {
    useUIStore.getState().setCursorLngLat([1, 2]);
    useUIStore.getState().setCursorLngLat(null);
    expect(useUIStore.getState().cursorLngLat).toBe(null);
  });

  it('setCurrentZoom 写入 zoom', () => {
    useUIStore.getState().setCurrentZoom(20);
    expect(useUIStore.getState().currentZoom).toBe(20);
  });

  it('requestFocusEntity 为相同实体生成新的定位请求', () => {
    const s = useUIStore.getState();
    s.requestFocusEntity('road_1');
    const first = useUIStore.getState().focusEntityRequest;

    s.requestFocusEntity('road_1');
    const second = useUIStore.getState().focusEntityRequest;

    expect(first).toMatchObject({ entityId: 'road_1', requestId: 1 });
    expect(second).toMatchObject({ entityId: 'road_1', requestId: 2 });
  });

  it('clearFocusEntityRequest 只清理匹配 requestId 的请求', () => {
    const s = useUIStore.getState();
    s.requestFocusEntity('lane_1');
    s.clearFocusEntityRequest(999);
    expect(useUIStore.getState().focusEntityRequest).not.toBeNull();

    s.clearFocusEntityRequest(1);
    expect(useUIStore.getState().focusEntityRequest).toBeNull();
  });
});
