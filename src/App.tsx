import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine } from '@/core/fsm/editorMachine';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useMapStore } from '@/store/mapStore';

export default function App() {
  const actorRef = useActorRef(editorMachine);
  const isDrawing = useSelector(actorRef, (s) => s.matches('drawPolyline'));
  const entityCount = useMapStore((s) => s.entities.size);

  return (
    <div className="relative w-full h-full">
      <MapCanvas actorRef={actorRef} />

      {/* 工具栏 */}
      <div className="absolute top-4 left-4 flex gap-2">
        <button
          onClick={() =>
            actorRef.send({ type: 'SELECT_TOOL', tool: 'drawPolyline' })
          }
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            isDrawing
              ? 'bg-yellow-500 text-black'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {isDrawing ? '绘制中...' : '绘制多段线'}
        </button>
      </div>

      {/* 状态栏 */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded bg-black/60 text-white/70 text-xs">
        {isDrawing ? '点击放置节点 | 双击或 Enter 完成 | Esc 取消' : `已绘制 ${entityCount} 条线`}
      </div>
    </div>
  );
}
