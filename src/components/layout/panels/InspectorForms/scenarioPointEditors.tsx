import { FaTrash, FaPlus } from 'react-icons/fa6';
import { useScenarioStore } from '@/store/scenarioStore';
import type { ScenarioObstacle, ScenarioEgo, WorldPoint } from '@/types/scenario';
import { Row, inputCls } from './scenarioFormRows';
import { useStableRowKeys } from './useStableRowKeys';

/**
 * 顶点/航点的逐点编辑（X/Y 受控 + 增删）。轨迹与 ego 航点共用一套行 UI，
 * 各自绑定 scenarioStore 的对应 action（均走 zundo undo）。
 */

function pointSignature(point: WorldPoint & { speed?: number }) {
  return [point.x, point.y, point.z ?? '', point.h ?? '', point.v ?? '', point.speed ?? ''].join(
    '|',
  );
}

function PointRow({
  index,
  point,
  onChange,
  onRemove,
}: {
  index: number;
  point: WorldPoint;
  onChange: (key: 'x' | 'y', value: number) => void;
  onRemove: () => void;
}) {
  return (
    <Row label={`#${index + 1}`}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          aria-label={`点 ${index + 1} X`}
          value={Number.isFinite(point.x) ? point.x : 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange('x', v);
          }}
          className={inputCls}
          title="X (世界米)"
        />
        <input
          type="number"
          aria-label={`点 ${index + 1} Y`}
          value={Number.isFinite(point.y) ? point.y : 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange('y', v);
          }}
          className={inputCls}
          title="Y (世界米)"
        />
        <button
          type="button"
          aria-label={`删除点 ${index + 1}`}
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-red-300/70 hover:bg-red-500/15 hover:text-red-200"
        >
          <FaTrash className="size-2.5" />
        </button>
      </div>
    </Row>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
    >
      <FaPlus className="size-2.5" />
      {label}
    </button>
  );
}

/** 障碍物轨迹顶点编辑。新增点默认落在末点附近（+5,+5）。 */
export function TrajectoryEditor({ obstacle }: { obstacle: ScenarioObstacle }) {
  const update = useScenarioStore((s) => s.updateTrajectoryVertex);
  const remove = useScenarioStore((s) => s.removeTrajectoryVertex);
  const add = useScenarioStore((s) => s.addTrajectoryVertex);
  const last = obstacle.trajectory[obstacle.trajectory.length - 1];
  const trajectoryRows = useStableRowKeys(
    obstacle.trajectory,
    `${obstacle.uid}-trajectory`,
    pointSignature,
  );

  return (
    <>
      {trajectoryRows.map(({ item: v, rowKey, index: i }) => (
        <PointRow
          key={rowKey}
          index={i}
          point={v}
          onChange={(key, value) => update(obstacle.uid, i, { ...v, [key]: value })}
          onRemove={() => remove(obstacle.uid, i)}
        />
      ))}
      <AddButton
        label="添加顶点"
        onClick={() =>
          add(obstacle.uid, {
            x: (last?.x ?? obstacle.position.x) + 5,
            y: (last?.y ?? obstacle.position.y) + 5,
          })
        }
      />
    </>
  );
}

/** ego 途经点编辑。 */
export function WaypointEditor({ ego }: { ego: ScenarioEgo }) {
  const update = useScenarioStore((s) => s.updateEgoWaypoint);
  const remove = useScenarioStore((s) => s.removeEgoWaypoint);
  const add = useScenarioStore((s) => s.addEgoWaypoint);
  const last = ego.waypoints[ego.waypoints.length - 1];
  const waypointRows = useStableRowKeys(ego.waypoints, 'ego-waypoint', pointSignature);

  return (
    <>
      {waypointRows.map(({ item: w, rowKey, index: i }) => (
        <PointRow
          key={rowKey}
          index={i}
          point={w}
          onChange={(key, value) => update(i, { ...w, [key]: value })}
          onRemove={() => remove(i)}
        />
      ))}
      <AddButton
        label="添加途经点"
        onClick={() => add({ x: (last?.x ?? ego.start.x) + 5, y: (last?.y ?? ego.start.y) + 5 })}
      />
    </>
  );
}
