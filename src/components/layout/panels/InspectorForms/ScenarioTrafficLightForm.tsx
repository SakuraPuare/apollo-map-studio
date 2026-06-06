import { FaTrash, FaPlus } from 'react-icons/fa6';
import { useScenarioStore } from '@/store/scenarioStore';
import type {
  ScenarioTrafficLight,
  TrafficLightColor,
  TriggerType,
  WorldPoint,
} from '@/types/scenario';
import { Section, Row, NumRow, TextRow, SelectRow, inputCls } from './scenarioFormRows';

const COLORS: TrafficLightColor[] = ['RED', 'GREEN', 'YELLOW'];
const TRIGGERS: TriggerType[] = ['TIME', 'DISTANCE', 'NA'];

/** 红绿灯属性表单（含配时方案编辑）。读写 scenarioStore（含 undo）。 */
export function ScenarioTrafficLightForm({ light }: { light: ScenarioTrafficLight }) {
  const updateTrafficLight = useScenarioStore((s) => s.updateTrafficLight);
  const removeTrafficLight = useScenarioStore((s) => s.removeTrafficLight);

  const patchLoc = (key: keyof WorldPoint, value: number) =>
    updateTrafficLight(light.uid, { location: { ...light.location, [key]: value } });

  return (
    <div className="text-xs text-zinc-300">
      <Section title="标识">
        <TextRow
          label="Signal ID"
          value={light.signalId}
          onChange={(v) => updateTrafficLight(light.uid, { signalId: v })}
        />
      </Section>

      <Section title="位置 (世界米)">
        <NumRow label="X" value={light.location.x} onChange={(v) => patchLoc('x', v)} />
        <NumRow label="Y" value={light.location.y} onChange={(v) => patchLoc('y', v)} />
      </Section>

      <Section title="初始状态">
        <SelectRow
          label="颜色"
          value={light.initialColor}
          options={COLORS}
          onChange={(v) => updateTrafficLight(light.uid, { initialColor: v as TrafficLightColor })}
        />
        <SelectRow
          label="触发"
          value={light.triggerType}
          options={TRIGGERS}
          onChange={(v) => updateTrafficLight(light.uid, { triggerType: v as TriggerType })}
        />
        <NumRow
          label="触发值"
          value={light.triggerValue ?? 0}
          onChange={(v) => updateTrafficLight(light.uid, { triggerValue: v })}
        />
      </Section>

      <Section title="配时方案">
        <StateGroupEditor light={light} onUpdate={updateTrafficLight} />
      </Section>

      <button
        type="button"
        onClick={() => removeTrafficLight(light.uid)}
        className="m-3 flex items-center gap-1.5 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/25"
      >
        <FaTrash className="size-3" />
        删除红绿灯
      </button>
    </div>
  );
}

/** 配时阶段（颜色 + 保持秒数）的增删改。拆成子组件以控制父表单行数。 */
function StateGroupEditor({
  light,
  onUpdate,
}: {
  light: ScenarioTrafficLight;
  onUpdate: (uid: string, patch: Partial<ScenarioTrafficLight>) => void;
}) {
  const patchState = (i: number, patch: Partial<(typeof light.stateGroup)[number]>) =>
    onUpdate(light.uid, {
      stateGroup: light.stateGroup.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  const addState = () =>
    onUpdate(light.uid, { stateGroup: [...light.stateGroup, { color: 'GREEN', keepTime: 10 }] });
  const removeState = (i: number) =>
    onUpdate(light.uid, { stateGroup: light.stateGroup.filter((_, idx) => idx !== i) });

  return (
    <>
      {light.stateGroup.map((st, i) => (
        <Row key={i} label={`#${i + 1}`}>
          <div className="flex items-center gap-1">
            <select
              aria-label={`阶段 ${i + 1} 颜色`}
              value={st.color}
              onChange={(e) => patchState(i, { color: e.target.value as TrafficLightColor })}
              className={inputCls}
            >
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              aria-label={`阶段 ${i + 1} 保持秒数`}
              step={0.5}
              value={st.keepTime ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) patchState(i, { keepTime: v });
              }}
              className={inputCls}
              title="保持秒数"
            />
            <button
              type="button"
              aria-label={`删除阶段 ${i + 1}`}
              onClick={() => removeState(i)}
              className="shrink-0 rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-300"
            >
              <FaTrash className="size-2.5" />
            </button>
          </div>
        </Row>
      ))}
      <button
        type="button"
        onClick={addState}
        className="mt-1 flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
      >
        <FaPlus className="size-2.5" />
        添加阶段
      </button>
    </>
  );
}
