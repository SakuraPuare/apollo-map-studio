import { useScenarioStore } from '@/store/scenarioStore';
import type { ScenarioEgo, WorldPoint } from '@/types/scenario';
import { Section, NumRow } from './scenarioFormRows';
import { WaypointEditor } from './scenarioPointEditors';

/** 主车（ego）属性表单。读写 scenarioStore（含 undo）。 */
export function ScenarioEgoForm({ ego }: { ego: ScenarioEgo }) {
  const setEgoPoint = useScenarioStore((s) => s.setEgoPoint);
  const updateEgo = useScenarioStore((s) => s.updateEgo);

  const patchStart = (key: keyof WorldPoint, value: number) =>
    setEgoPoint('start', { ...ego.start, [key]: value });
  const patchEnd = (key: keyof WorldPoint, value: number) =>
    setEgoPoint('end', { ...ego.end, [key]: value });

  return (
    <div className="text-xs text-zinc-300">
      <Section title="起点 (世界米)">
        <NumRow label="X" value={ego.start.x} onChange={(v) => patchStart('x', v)} />
        <NumRow label="Y" value={ego.start.y} onChange={(v) => patchStart('y', v)} />
        <NumRow
          label="朝向 (rad)"
          value={ego.start.h ?? 0}
          step={0.01}
          onChange={(v) => patchStart('h', v)}
        />
      </Section>

      <Section title="终点 (世界米)">
        <NumRow label="X" value={ego.end.x} onChange={(v) => patchEnd('x', v)} />
        <NumRow label="Y" value={ego.end.y} onChange={(v) => patchEnd('y', v)} />
      </Section>

      <Section title="运动">
        <NumRow
          label="初速 (m/s)"
          value={ego.startVelocity ?? 0}
          step={0.1}
          onChange={(v) => updateEgo({ startVelocity: v })}
        />
        <NumRow
          label="初加速度"
          value={ego.startAcceleration ?? 0}
          step={0.1}
          onChange={(v) => updateEgo({ startAcceleration: v })}
        />
      </Section>

      <Section title="途经点 (世界米)">
        <WaypointEditor ego={ego} />
      </Section>
    </div>
  );
}
