import { useEffect, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool, isDrawingState } from '@/core/fsm/editorMachine';
import { MapCanvas } from '@/components/map/MapCanvas';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
import { useMapStore } from '@/store/mapStore';
import {
  useSettingsStore,
  MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT,
  MIN_LANE_HALF_WIDTH, MAX_LANE_HALF_WIDTH,
  MIN_LANE_ARROW_SPACING, MAX_LANE_ARROW_SPACING,
  MIN_MAP_ZOOM, MAX_MAP_ZOOM,
} from '@/store/settingsStore';
import { MAP_ELEMENTS, ALL_DRAW_TOOLS, ELEMENT_MAP, type MapElementType } from '@/core/elements';

/** 通用数字输入框：失焦/回车提交，非法值回滚 */
function NumInput({
  value, onChange, min, max, step = 1,
  onCommit, onReset,
}: {
  value: string; onChange: (v: string) => void;
  min: number; max: number; step?: number;
  onCommit: (n: number) => void; onReset: () => void;
}) {
  const commit = () => {
    const n = Number(value);
    if (Number.isFinite(n)) onCommit(Math.max(min, Math.min(max, n)));
    else onReset();
  };
  return (
    <input
      type="number" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs outline-none focus:border-cyan-400"
    />
  );
}

const HINTS: Record<string, string> = {
  drawPolyline: '点击放置节点 | 双击或 Enter 完成 | Esc 取消',
  drawCatmullRom: '点击放置途经点 | 双击或 Enter 完成 | Esc 取消',
  drawBezier: '点击放置锚点，拖拽定义控制柄 | 双击或 Enter 完成 | Esc 取消',
  drawArc: '依次点击起点、弧上点、终点（三点自动完成） | Esc 取消',
  drawRect: '点击对角两点绘制矩形 | 选中后拖拽旋转手柄旋转 | Esc 取消',
  drawPolygon: '点击放置顶点 | 双击或 Enter 完成（自动闭合） | Esc 取消',
  selected: '拖拽控制点编辑 | Delete 删除 | Esc 取消选中',
  editingPoint: '拖拽中... 松开鼠标确认位置',
};

export default function App() {
  const actorRef = useActorRef(editorMachine);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const selectedEntityId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const entityCount = useMapStore((s) => s.entities.size);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const historyLimit    = useSettingsStore((s) => s.historyLimit);
  const setHistoryLimit = useSettingsStore((s) => s.setHistoryLimit);
  const [draftHistory, setDraftHistory] = useState(String(historyLimit));

  const mapCenterLng    = useSettingsStore((s) => s.mapCenterLng);
  const mapCenterLat    = useSettingsStore((s) => s.mapCenterLat);
  const mapZoom         = useSettingsStore((s) => s.mapZoom);
  const setMapCenter    = useSettingsStore((s) => s.setMapCenter);
  const setMapZoom      = useSettingsStore((s) => s.setMapZoom);
  const [draftLng, setDraftLng] = useState(String(mapCenterLng));
  const [draftLat, setDraftLat] = useState(String(mapCenterLat));
  const [draftZoom, setDraftZoom] = useState(String(mapZoom));

  const laneHalfWidth    = useSettingsStore((s) => s.laneHalfWidth);
  const setLaneHalfWidth = useSettingsStore((s) => s.setLaneHalfWidth);
  const [draftLaneW, setDraftLaneW] = useState(String(laneHalfWidth));

  const laneArrowSpacing    = useSettingsStore((s) => s.laneArrowSpacing);
  const setLaneArrowSpacing = useSettingsStore((s) => s.setLaneArrowSpacing);
  const [draftArrow, setDraftArrow] = useState(String(laneArrowSpacing));

  // 元素选择状态（持久，不随绘制完成清除）
  const [selectedElement, setSelectedElement] = useState<MapElementType | null>(null);

  const isDrawing = isDrawingState(currentState);
  const elementDef = selectedElement ? ELEMENT_MAP.get(selectedElement) : null;

  // 根据选中元素筛选可用工具
  const availableTools = elementDef
    ? ALL_DRAW_TOOLS.filter((t) => elementDef.tools.includes(t.tool))
    : ALL_DRAW_TOOLS;

  // 元素选择
  const handleElementSelect = (type: MapElementType) => {
    if (selectedElement === type) {
      // 取消选中
      setSelectedElement(null);
      if (isDrawing) actorRef.send({ type: 'CANCEL' });
    } else {
      const def = ELEMENT_MAP.get(type)!;
      setSelectedElement(type);
      actorRef.send({ type: 'SELECT_TOOL', tool: def.defaultTool, element: type });
    }
  };

  // 工具选择
  const handleToolSelect = (tool: DrawTool) => {
    actorRef.send({ type: 'SELECT_TOOL', tool, element: selectedElement ?? undefined });
  };

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      const { undo, redo } = useMapStore.temporal.getState();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative w-full h-full">
      <MapCanvas actorRef={actorRef} />

      {/* 第一行：地图元素选择 */}
      <div className="absolute top-4 left-4 flex flex-wrap gap-1.5 max-w-[900px]">
        {MAP_ELEMENTS.map((el) => {
          const active = selectedElement === el.type;
          return (
            <button
              key={el.type}
              onClick={() => handleElementSelect(el.type)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors border ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/15'
              }`}
              style={active ? { backgroundColor: el.color + '99', borderColor: el.color } : undefined}
            >
              {el.label}
            </button>
          );
        })}
      </div>

      {/* 第二行：绘制工具（根据元素筛选） */}
      <div className="absolute top-14 left-4 flex gap-1.5">
        {availableTools.map(({ tool, label, color }) => {
          const active = currentState === tool;
          return (
            <button
              key={tool}
              onClick={() => handleToolSelect(tool)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                active
                  ? `${color} text-black`
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {active ? `${label}绘制中` : label}
            </button>
          );
        })}
        {selectedElement && (
          <span className="px-2 py-1.5 text-white/40 text-xs self-center">
            ← {elementDef?.label}可用工具
          </span>
        )}
      </div>

      {/* 状态栏 */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded bg-black/60 text-white/70 text-xs">
        {HINTS[currentState]
          ? (selectedElement
            ? `[${elementDef?.label}] ${HINTS[currentState]}`
            : HINTS[currentState])
          : `已绘制 ${entityCount} 个元素 | 点击元素选中编辑`}
      </div>

      {/* 属性面板 */}
      <PropertiesPanel selectedId={selectedEntityId} />

      {/* 设置按钮 */}
      <button
        onClick={() => setSettingsOpen((v) => !v)}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded bg-white/10 text-white hover:bg-white/20 transition-colors text-sm"
        title="设置"
      >
        ⚙
      </button>

      {/* 设置面板 */}
      {settingsOpen && (
        <div className="absolute top-14 right-4 w-72 rounded-lg bg-gray-900/95 border border-white/10 p-4 text-white text-sm shadow-lg space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-medium">设置</span>
            <button onClick={() => setSettingsOpen(false)} className="text-white/50 hover:text-white">✕</button>
          </div>

          {/* 撤销历史 */}
          <section>
            <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-2">撤销历史</p>
            <label className="block mb-1 text-white/70 text-xs">历史条数</label>
            <NumInput
              value={draftHistory} onChange={setDraftHistory}
              min={MIN_HISTORY_LIMIT} max={MAX_HISTORY_LIMIT}
              onCommit={(n) => { setHistoryLimit(n); setDraftHistory(String(Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(n))))); }}
              onReset={() => setDraftHistory(String(historyLimit))}
            />
            <p className="mt-1 text-white/40 text-xs">范围 {MIN_HISTORY_LIMIT}–{MAX_HISTORY_LIMIT}</p>
          </section>

          {/* 地图初始视角 */}
          <section>
            <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-2">地图初始视角 <span className="text-white/30 normal-case">（重启生效）</span></p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block mb-1 text-white/70 text-xs">经度 Lng</label>
                <NumInput value={draftLng} onChange={setDraftLng} min={-180} max={180}
                  onCommit={(n) => { setMapCenter(n, mapCenterLat); setDraftLng(String(n)); }}
                  onReset={() => setDraftLng(String(mapCenterLng))} />
              </div>
              <div>
                <label className="block mb-1 text-white/70 text-xs">纬度 Lat</label>
                <NumInput value={draftLat} onChange={setDraftLat} min={-90} max={90}
                  onCommit={(n) => { setMapCenter(mapCenterLng, n); setDraftLat(String(n)); }}
                  onReset={() => setDraftLat(String(mapCenterLat))} />
              </div>
            </div>
            <label className="block mt-2 mb-1 text-white/70 text-xs">缩放级别 Zoom</label>
            <NumInput value={draftZoom} onChange={setDraftZoom} min={MIN_MAP_ZOOM} max={MAX_MAP_ZOOM}
              onCommit={(n) => { setMapZoom(n); setDraftZoom(String(n)); }}
              onReset={() => setDraftZoom(String(mapZoom))} />
          </section>

          {/* 车道设置 */}
          <section>
            <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-2">车道</p>
            <label className="block mb-1 text-white/70 text-xs">默认半宽（米，影响新建车道）</label>
            <NumInput value={draftLaneW} onChange={setDraftLaneW} min={MIN_LANE_HALF_WIDTH} max={MAX_LANE_HALF_WIDTH} step={0.25}
              onCommit={(n) => { setLaneHalfWidth(n); setDraftLaneW(String(n)); }}
              onReset={() => setDraftLaneW(String(laneHalfWidth))} />
            <label className="block mt-2 mb-1 text-white/70 text-xs">方向箭头间距（像素，实时生效）</label>
            <NumInput value={draftArrow} onChange={setDraftArrow} min={MIN_LANE_ARROW_SPACING} max={MAX_LANE_ARROW_SPACING} step={10}
              onCommit={(n) => { setLaneArrowSpacing(n); setDraftArrow(String(n)); }}
              onReset={() => setDraftArrow(String(laneArrowSpacing))} />
          </section>
        </div>
      )}
    </div>
  );
}
