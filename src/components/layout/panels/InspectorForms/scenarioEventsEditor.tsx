import { FaTrash, FaPlus } from 'react-icons/fa6';
import { useScenarioStore } from '@/store/scenarioStore';
import { makeEvent } from '@/io/scenario/factory';
import type {
  ScenarioObstacle,
  ScenarioEvent,
  ScenarioTrigger,
  ScenarioEventAction,
} from '@/types/scenario';
import { Row, inputCls } from './scenarioFormRows';

/**
 * 障碍物动态事件（中途变速/变道）编辑。每个事件 = 触发条件 + 动作。
 * 新增事件 ref=null，序列化时 append 到对应 actor 的 maneuver；编辑既有事件就地 patch。
 * 仅建模语料里真实出现的 speed / laneChange 两类动作。
 */

const TRIGGER_KINDS: ScenarioTrigger['kind'][] = ['simulationTime', 'distance', 'relativeDistance'];
const ACTION_KINDS: ScenarioEventAction['kind'][] = ['speed', 'laneChange'];

export function EventsEditor({ obstacle }: { obstacle: ScenarioObstacle }) {
  const addEvent = useScenarioStore((s) => s.addEvent);
  const removeEvent = useScenarioStore((s) => s.removeEvent);

  return (
    <>
      {obstacle.events.map((ev, i) => (
        <EventCard
          key={ev.uid}
          obstacleUid={obstacle.uid}
          index={i}
          ev={ev}
          onRemove={() => removeEvent(obstacle.uid, i)}
        />
      ))}
      <button
        type="button"
        onClick={() => addEvent(obstacle.uid, makeEvent())}
        className="mt-1 flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
      >
        <FaPlus className="size-2.5" />
        添加事件
      </button>
    </>
  );
}

function EventCard({
  obstacleUid,
  index,
  ev,
  onRemove,
}: {
  obstacleUid: string;
  index: number;
  ev: ScenarioEvent;
  onRemove: () => void;
}) {
  const updateEvent = useScenarioStore((s) => s.updateEvent);
  const patch = (p: Partial<ScenarioEvent>) => updateEvent(obstacleUid, index, p);

  return (
    <div className="mb-2 rounded border border-white/[0.07] p-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          事件 #{index + 1}
        </span>
        <button
          type="button"
          aria-label={`删除事件 ${index + 1}`}
          onClick={onRemove}
          className="rounded p-1 text-red-300/70 hover:bg-red-500/15 hover:text-red-200"
        >
          <FaTrash className="size-2.5" />
        </button>
      </div>
      <TriggerRows ev={ev} patch={patch} />
      <ActionRows ev={ev} patch={patch} />
    </div>
  );
}

function TriggerRows({
  ev,
  patch,
}: {
  ev: ScenarioEvent;
  patch: (p: Partial<ScenarioEvent>) => void;
}) {
  const trig = ev.trigger;
  return (
    <>
      <Row label="触发">
        <select
          aria-label="触发类型"
          value={trig?.kind ?? 'simulationTime'}
          onChange={(e) =>
            patch({
              trigger: {
                kind: e.target.value as ScenarioTrigger['kind'],
                rule: trig?.rule ?? 'greaterOrEqual',
                value: trig?.value ?? 0,
              },
            })
          }
          className={inputCls}
        >
          {TRIGGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Row>
      <Row label="触发值">
        <input
          type="number"
          aria-label="触发值"
          value={trig?.value ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && trig) patch({ trigger: { ...trig, value: v } });
          }}
          className={inputCls}
        />
      </Row>
    </>
  );
}

function ActionRows({
  ev,
  patch,
}: {
  ev: ScenarioEvent;
  patch: (p: Partial<ScenarioEvent>) => void;
}) {
  const a = ev.action;
  return (
    <>
      <Row label="动作">
        <select
          aria-label="动作类型"
          value={a.kind}
          onChange={(e) =>
            patch({ action: defaultAction(e.target.value as ScenarioEventAction['kind']) })
          }
          className={inputCls}
        >
          {ACTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Row>
      {a.kind === 'speed' ? (
        <Row label="目标速度">
          <input
            type="number"
            aria-label="目标速度"
            value={a.targetSpeed}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) patch({ action: { ...a, targetSpeed: v } });
            }}
            className={inputCls}
          />
        </Row>
      ) : (
        <Row label="相对车道">
          <input
            type="number"
            aria-label="相对目标车道"
            value={a.relativeTargetLane}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) patch({ action: { ...a, relativeTargetLane: v } });
            }}
            className={inputCls}
          />
        </Row>
      )}
    </>
  );
}

function defaultAction(kind: ScenarioEventAction['kind']): ScenarioEventAction {
  if (kind === 'laneChange') {
    return {
      kind: 'laneChange',
      relativeTargetLane: 1,
      dynamicsDimension: 'distance',
      dynamicsValue: 0,
    };
  }
  return {
    kind: 'speed',
    targetSpeed: 5,
    dynamicsShape: 'linear',
    dynamicsDimension: 'time',
    dynamicsValue: 1,
  };
}
