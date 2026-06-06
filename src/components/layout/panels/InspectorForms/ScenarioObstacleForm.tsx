import { useCallback } from 'react';
import { FaTrash } from 'react-icons/fa6';
import { useScenarioStore } from '@/store/scenarioStore';
import type { ObstacleKind, ScenarioObstacle, WorldPoint } from '@/types/scenario';
import { Section, NumRow, SelectRow, ReadRow } from './scenarioFormRows';
import { TrajectoryEditor } from './scenarioPointEditors';
import { EventsEditor } from './scenarioEventsEditor';

const KIND_OPTIONS: ObstacleKind[] = [
  'vehicle',
  'bicycle',
  'pedestrian',
  'staticObstacle',
  'unknown',
];

/**
 * 场景障碍物属性表单。直接读写 scenarioStore（含 zundo undo），
 * 不走 react-hook-form —— 字段少且无校验需求，受控输入更直接。
 */
export function ScenarioObstacleForm({ obstacle }: { obstacle: ScenarioObstacle }) {
  const updateObstacle = useScenarioStore((s) => s.updateObstacle);
  const updateObstaclePosition = useScenarioStore((s) => s.updateObstaclePosition);
  const removeObstacle = useScenarioStore((s) => s.removeObstacle);

  const patchPos = useCallback(
    (key: keyof WorldPoint, value: number) => {
      updateObstaclePosition(obstacle.uid, { ...obstacle.position, [key]: value });
    },
    [obstacle.position, obstacle.uid, updateObstaclePosition],
  );

  const patchDim = useCallback(
    (key: 'length' | 'width' | 'height', value: number) => {
      updateObstacle(obstacle.uid, {
        dimensions: { ...obstacle.dimensions, [key]: value },
      });
    },
    [obstacle.dimensions, obstacle.uid, updateObstacle],
  );

  return (
    <div className="text-xs text-zinc-300">
      <Section title="标识">
        <ReadRow label="名称" value={obstacle.name} />
        <SelectRow
          label="类型"
          value={obstacle.kind}
          options={KIND_OPTIONS}
          onChange={(v) => updateObstacle(obstacle.uid, { kind: v as ObstacleKind })}
        />
        <ReadRow label="Apollo ID" value={obstacle.apolloId} />
      </Section>

      <Section title="位置 (世界米)">
        <NumRow label="X" value={obstacle.position.x} onChange={(v) => patchPos('x', v)} />
        <NumRow label="Y" value={obstacle.position.y} onChange={(v) => patchPos('y', v)} />
        <NumRow
          label="朝向 (rad)"
          value={obstacle.position.h ?? 0}
          step={0.01}
          onChange={(v) => patchPos('h', v)}
        />
      </Section>

      <Section title="尺寸 (米)">
        <NumRow
          label="长"
          value={obstacle.dimensions.length}
          onChange={(v) => patchDim('length', v)}
        />
        <NumRow
          label="宽"
          value={obstacle.dimensions.width}
          onChange={(v) => patchDim('width', v)}
        />
        <NumRow
          label="高"
          value={obstacle.dimensions.height}
          onChange={(v) => patchDim('height', v)}
        />
      </Section>

      <Section title="运动">
        <NumRow
          label="初速 (m/s)"
          value={obstacle.initialSpeed}
          step={0.1}
          onChange={(v) => updateObstacle(obstacle.uid, { initialSpeed: v })}
        />
        <ReadRow label="运动" value={obstacle.moving ? '是' : '否'} />
      </Section>

      <Section title="轨迹顶点 (世界米)">
        <TrajectoryEditor obstacle={obstacle} />
      </Section>

      <Section title="动态事件">
        <EventsEditor obstacle={obstacle} />
      </Section>

      <button
        type="button"
        onClick={() => removeObstacle(obstacle.uid)}
        className="m-3 flex items-center gap-1.5 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/25"
      >
        <FaTrash className="size-3" />
        删除障碍物
      </button>
    </div>
  );
}
