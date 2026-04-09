import { useEffect, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool, isDrawingState } from '@/core/fsm/editorMachine';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore, MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from '@/store/settingsStore';

const TOOLS: { tool: DrawTool; label: string; activeLabel: string; color: string }[] = [
  // { tool: 'drawPolyline', label: '多段线', activeLabel: '多段线绘制中', color: 'bg-cyan-500' },
  // { tool: 'drawCatmullRom', label: '样条曲线', activeLabel: '样条曲线绘制中', color: 'bg-green-500' },
  { tool: 'drawBezier', label: '贝塞尔', activeLabel: '贝塞尔绘制中', color: 'bg-pink-500' },
  { tool: 'drawArc', label: '圆弧', activeLabel: '圆弧绘制中', color: 'bg-amber-500' },
  { tool: 'drawRect', label: '矩形', activeLabel: '矩形绘制中', color: 'bg-red-500' },
  { tool: 'drawPolygon', label: '多边形', activeLabel: '多边形绘制中', color: 'bg-purple-500' },
];

const HINTS: Record<string, string> = {
  drawPolyline: '点击放置节点 | 双击或 Enter 完成 | Esc 取消',
  drawCatmullRom: '点击放置途经点 | 双击或 Enter 完成 | Esc 取消',
  drawBezier: '点击放置锚点，拖拽定义控制柄 | 双击或 Enter 完成 | Esc 取消',
  drawArc: '依次点击起点、弧上点、终点（三点自动完成） | Esc 取消',
  drawRect: '点击对角两点绘制矩形 | 选中后拖拽旋转手柄旋转 | Esc 取消',
  drawPolygon: '点击放置顶点 | 双击或 Enter 完成（自动闭合） | Esc 取消',
  selected: '拖拽控制点编辑 | Alt+点击锚点切换尖角/平滑 | Alt+拖拽控制柄打破对称 | Delete 删除 | Esc 取消选中',
  editingPoint: '拖拽中... 松开鼠标确认位置',
};

export default function App() {
  const actorRef = useActorRef(editorMachine);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const entityCount = useMapStore((s) => s.entities.size);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const historyLimit = useSettingsStore((s) => s.historyLimit);
  const setHistoryLimit = useSettingsStore((s) => s.setHistoryLimit);
  const [draft, setDraft] = useState(String(historyLimit));

  const isDrawing = isDrawingState(currentState);

  // Ctrl+Z / Ctrl+Shift+Z 撤销/重做
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

      {/* 工具栏 */}
      <div className="absolute top-4 left-4 flex gap-1.5">
        {TOOLS.map(({ tool, label, activeLabel, color }) => {
          const active = currentState === tool;
          return (
            <button
              key={tool}
              onClick={() => actorRef.send({ type: 'SELECT_TOOL', tool })}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                active
                  ? `${color} text-black`
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {active ? activeLabel : label}
            </button>
          );
        })}
      </div>

      {/* 状态栏 */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded bg-black/60 text-white/70 text-xs">
        {HINTS[currentState]
          ? HINTS[currentState]
          : `已绘制 ${entityCount} 条曲线 | 点击曲线选中编辑`}
      </div>

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
        <div className="absolute top-14 right-4 w-64 rounded-lg bg-gray-900/95 border border-white/10 p-4 text-white text-sm shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium">设置</span>
            <button onClick={() => setSettingsOpen(false)} className="text-white/50 hover:text-white">✕</button>
          </div>
          <label className="block mb-1 text-white/70 text-xs">撤销/重做历史条数</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={MIN_HISTORY_LIMIT}
              max={MAX_HISTORY_LIMIT}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                const n = Number(draft);
                if (Number.isFinite(n)) {
                  setHistoryLimit(n);
                  setDraft(String(Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(n)))));
                } else {
                  setDraft(String(historyLimit));
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm outline-none focus:border-cyan-400"
            />
          </div>
          <p className="mt-1.5 text-white/40 text-xs">范围 {MIN_HISTORY_LIMIT}–{MAX_HISTORY_LIMIT}，修改后刷新页面生效</p>
        </div>
      )}
    </div>
  );
}
