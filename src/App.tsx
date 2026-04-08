import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool } from '@/core/fsm/editorMachine';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useMapStore } from '@/store/mapStore';

const TOOLS: { tool: DrawTool; label: string; activeLabel: string; color: string }[] = [
  { tool: 'drawPolyline', label: '多段线', activeLabel: '多段线绘制中', color: 'bg-cyan-500' },
  // { tool: 'drawCatmullRom', label: '样条曲线', activeLabel: '样条曲线绘制中', color: 'bg-green-500' },
  { tool: 'drawBezier', label: '贝塞尔', activeLabel: '贝塞尔绘制中', color: 'bg-pink-500' },
  { tool: 'drawArc', label: '圆弧', activeLabel: '圆弧绘制中', color: 'bg-amber-500' },
];

const HINTS: Record<string, string> = {
  drawPolyline: '点击放置节点 | 双击或 Enter 完成 | Esc 取消',
  drawCatmullRom: '点击放置途经点 | 双击或 Enter 完成 | Esc 取消',
  drawBezier: '点击放置锚点，拖拽定义控制柄 | 双击或 Enter 完成 | Esc 取消',
  drawArc: '依次点击起点、弧上点、终点（三点自动完成） | Esc 取消',
};

export default function App() {
  const actorRef = useActorRef(editorMachine);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const entityCount = useMapStore((s) => s.entities.size);

  const isDrawing = currentState !== 'idle';

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
        {isDrawing
          ? HINTS[currentState] ?? ''
          : `已绘制 ${entityCount} 条曲线`}
      </div>
    </div>
  );
}
