import { useMapStore } from '@/store/mapStore';
import type { MapEntity } from '@/types/entities';
import type {
  LaneEntity, LaneType, LaneTurn, LaneDirection, BoundaryLineType,
  JunctionEntity, JunctionType,
  ParkingSpaceEntity,
  SignalEntity, SignalType,
  StopSignEntity, StopSignType,
} from '@/types/apollo';

// ─── helpers ─────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-white/40 text-xs w-24 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function ValText({ v }: { v: React.ReactNode }) {
  return <span className="text-white/80 text-xs font-mono">{v}</span>;
}

function Select<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white text-xs outline-none focus:border-cyan-400 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-gray-900">
          {o}
        </option>
      ))}
    </select>
  );
}

function NumberInput({ value, onChange, min, max, step = 0.1 }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      className="w-full px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white text-xs outline-none focus:border-cyan-400"
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-white/30 text-xs font-medium uppercase tracking-wide mb-1 mt-3 first:mt-0">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ─── entity-type panels ───────────────────────────────────────────────

const LANE_TYPES: LaneType[] = ['NONE', 'CITY_DRIVING', 'BIKING', 'SIDEWALK', 'PARKING', 'SHOULDER', 'SHARED'];
const LANE_TURNS: LaneTurn[] = ['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN'];
const LANE_DIRS: LaneDirection[] = ['FORWARD', 'BACKWARD', 'BIDIRECTION'];
const BOUNDARY_TYPES: BoundaryLineType[] = [
  'UNKNOWN', 'DOTTED_YELLOW', 'DOTTED_WHITE', 'SOLID_YELLOW', 'SOLID_WHITE', 'DOUBLE_YELLOW', 'CURB',
];

/** 从采样数组计算平均宽度 */
function avgWidth(samples: { s: number; width: number }[]): number | null {
  if (!samples.length) return null;
  return samples.reduce((sum, s) => sum + s.width, 0) / samples.length;
}

/** 宽度采样折叠显示：起点/中点/终点 */
function WidthSamples({ samples, label }: {
  samples: { s: number; width: number }[];
  label: string;
}) {
  if (!samples.length) return <Row label={label}><ValText v="—" /></Row>;
  // show start / mid / end samples
  const pts = samples.length <= 3
    ? samples
    : [samples[0], samples[Math.floor(samples.length / 2)], samples[samples.length - 1]];
  return (
    <Row label={label}>
      <div className="space-y-0.5">
        {pts.map((p, i) => (
          <span key={i} className="block text-white/80 text-xs font-mono">
            s={p.s.toFixed(1)}m → {p.width.toFixed(3)}m
          </span>
        ))}
        {samples.length > 3 && (
          <span className="block text-white/30 text-[10px]">共 {samples.length} 个采样点</span>
        )}
      </div>
    </Row>
  );
}

function LanePanel({ entity }: { entity: LaneEntity }) {
  const update = useMapStore((s) => s.updateEntity);
  const patch = (changes: Partial<LaneEntity>) =>
    update(entity.id, { ...entity, ...changes });

  const leftType = entity.leftBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN';
  const rightType = entity.rightBoundary.boundaryType[0]?.types[0] ?? 'UNKNOWN';

  const setLeftBoundary = (t: BoundaryLineType) =>
    patch({
      leftBoundary: {
        ...entity.leftBoundary,
        boundaryType: [{ s: 0, types: [t] }],
      },
    });

  const setRightBoundary = (t: BoundaryLineType) =>
    patch({
      rightBoundary: {
        ...entity.rightBoundary,
        boundaryType: [{ s: 0, types: [t] }],
      },
    });

  const avgL = avgWidth(entity.leftSamples);
  const avgR = avgWidth(entity.rightSamples);
  const totalWidth = avgL !== null && avgR !== null ? avgL + avgR : null;

  return (
    <>
      <Section title="属性">
        <Row label="类型">
          <Select value={entity.type} options={LANE_TYPES} onChange={(v) => patch({ type: v })} />
        </Row>
        <Row label="转向">
          <Select value={entity.turn} options={LANE_TURNS} onChange={(v) => patch({ turn: v })} />
        </Row>
        <Row label="方向">
          <Select value={entity.direction} options={LANE_DIRS} onChange={(v) => patch({ direction: v })} />
        </Row>
        <Row label="限速 (m/s)">
          <NumberInput value={entity.speedLimit} min={0} max={50} onChange={(v) => patch({ speedLimit: v })} />
        </Row>
        <Row label="长度">
          <ValText v={`${entity.length.toFixed(3)} m`} />
        </Row>
      </Section>

      <Section title="宽度采样 (left_sample / right_sample)">
        <Row label="均值总宽">
          <ValText v={totalWidth !== null ? `${totalWidth.toFixed(3)} m` : '—'} />
        </Row>
        <Row label="均值左宽">
          <ValText v={avgL !== null ? `${avgL.toFixed(3)} m` : '—'} />
        </Row>
        <Row label="均值右宽">
          <ValText v={avgR !== null ? `${avgR.toFixed(3)} m` : '—'} />
        </Row>
        <WidthSamples samples={entity.leftSamples} label="左采样" />
        <WidthSamples samples={entity.rightSamples} label="右采样" />
      </Section>

      {(entity.leftRoadSamples.length > 0 || entity.rightRoadSamples.length > 0) && (
        <Section title="道路边界采样 (left/right_road_sample)">
          <WidthSamples samples={entity.leftRoadSamples} label="左路边" />
          <WidthSamples samples={entity.rightRoadSamples} label="右路边" />
        </Section>
      )}

      <Section title="边界线型">
        <Row label="左边界">
          <Select value={leftType} options={BOUNDARY_TYPES} onChange={setLeftBoundary} />
        </Row>
        <Row label="右边界">
          <Select value={rightType} options={BOUNDARY_TYPES} onChange={setRightBoundary} />
        </Row>
        <Row label="左边界长">
          <ValText v={`${entity.leftBoundary.length.toFixed(3)} m`} />
        </Row>
        <Row label="右边界长">
          <ValText v={`${entity.rightBoundary.length.toFixed(3)} m`} />
        </Row>
      </Section>

      <Section title="拓扑">
        <Row label="前驱">
          <ValText v={entity.predecessorIds.length ? entity.predecessorIds.join(', ') : '—'} />
        </Row>
        <Row label="后继">
          <ValText v={entity.successorIds.length ? entity.successorIds.join(', ') : '—'} />
        </Row>
        <Row label="左邻正向">
          <ValText v={entity.leftNeighborForwardIds.length ? entity.leftNeighborForwardIds.join(', ') : '—'} />
        </Row>
        <Row label="右邻正向">
          <ValText v={entity.rightNeighborForwardIds.length ? entity.rightNeighborForwardIds.join(', ') : '—'} />
        </Row>
        <Row label="左邻反向">
          <ValText v={entity.leftNeighborReverseIds.length ? entity.leftNeighborReverseIds.join(', ') : '—'} />
        </Row>
        <Row label="右邻反向">
          <ValText v={entity.rightNeighborReverseIds.length ? entity.rightNeighborReverseIds.join(', ') : '—'} />
        </Row>
        <Row label="反向车道">
          <ValText v={entity.selfReverseLaneIds.length ? entity.selfReverseLaneIds.join(', ') : '—'} />
        </Row>
        <Row label="路口 ID">
          <ValText v={entity.junctionId ?? '—'} />
        </Row>
        <Row label="重叠 ID">
          <ValText v={entity.overlapIds.length ? `${entity.overlapIds.length} 个` : '—'} />
        </Row>
      </Section>
    </>
  );
}

const JUNCTION_TYPES: JunctionType[] = [
  'UNKNOWN', 'IN_ROAD', 'CROSS_ROAD', 'FORK_ROAD', 'MAIN_SIDE', 'DEAD_END',
];

function JunctionPanel({ entity }: { entity: JunctionEntity }) {
  const update = useMapStore((s) => s.updateEntity);
  return (
    <Section title="属性">
      <Row label="类型">
        <Select
          value={entity.type}
          options={JUNCTION_TYPES}
          onChange={(v) => update(entity.id, { ...entity, type: v })}
        />
      </Row>
      <Row label="顶点数">
        <ValText v={entity.polygon.points.length} />
      </Row>
    </Section>
  );
}

function ParkingSpacePanel({ entity }: { entity: ParkingSpaceEntity }) {
  const update = useMapStore((s) => s.updateEntity);
  return (
    <Section title="属性">
      <Row label="朝向 (°)">
        <NumberInput
          value={parseFloat((entity.heading * 180 / Math.PI).toFixed(2))}
          min={-180} max={180}
          onChange={(v) => update(entity.id, { ...entity, heading: v * Math.PI / 180 })}
        />
      </Row>
    </Section>
  );
}

const SIGNAL_TYPES: SignalType[] = [
  'UNKNOWN_SIGNAL', 'MIX_2_HORIZONTAL', 'MIX_2_VERTICAL',
  'MIX_3_HORIZONTAL', 'MIX_3_VERTICAL', 'SINGLE',
];

function SignalPanel({ entity }: { entity: SignalEntity }) {
  const update = useMapStore((s) => s.updateEntity);
  return (
    <Section title="属性">
      <Row label="类型">
        <Select
          value={entity.type}
          options={SIGNAL_TYPES}
          onChange={(v) => update(entity.id, { ...entity, type: v })}
        />
      </Row>
      <Row label="子信号">
        <ValText v={entity.subsignals.length} />
      </Row>
    </Section>
  );
}

const STOP_SIGN_TYPES: StopSignType[] = [
  'UNKNOWN_STOP_SIGN', 'ONE_WAY', 'TWO_WAY', 'THREE_WAY', 'FOUR_WAY', 'ALL_WAY',
];

function StopSignPanel({ entity }: { entity: StopSignEntity }) {
  const update = useMapStore((s) => s.updateEntity);
  return (
    <Section title="属性">
      <Row label="类型">
        <Select
          value={entity.type}
          options={STOP_SIGN_TYPES}
          onChange={(v) => update(entity.id, { ...entity, type: v })}
        />
      </Row>
    </Section>
  );
}

function DrawingPanel({ entity }: { entity: MapEntity }) {
  const ptCount = (() => {
    if (entity.entityType === 'polyline' || entity.entityType === 'catmullRom' || entity.entityType === 'polygon')
      return entity.points.length;
    if (entity.entityType === 'bezier') return entity.anchors.length;
    if (entity.entityType === 'arc') return 3;
    if (entity.entityType === 'rect') return 4;
    return '—';
  })();

  return (
    <Section title="几何">
      <Row label="节点数"><ValText v={ptCount} /></Row>
    </Section>
  );
}

// ─── entity type label map ────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  lane: '车道', junction: '路口', parkingSpace: '车位', parkingLot: '停车场',
  signal: '信号灯', crosswalk: '人行横道', stopSign: '停车标志', speedBump: '减速带',
  yieldSign: '让行标志', clearArea: '禁停区', road: '道路', area: '区域',
  rsu: 'RSU', barrierGate: '道闸', pncJunction: 'PNC路口', overlap: '重叠',
  polyline: '折线', catmullRom: 'CatmullRom', bezier: '贝塞尔', arc: '圆弧',
  rect: '矩形', polygon: '多边形',
};

// ─── main component ───────────────────────────────────────────────────

function EntityDetail({ entity }: { entity: MapEntity }) {
  switch (entity.entityType) {
    case 'lane':        return <LanePanel entity={entity} />;
    case 'junction':    return <JunctionPanel entity={entity} />;
    case 'parkingSpace': return <ParkingSpacePanel entity={entity} />;
    case 'signal':      return <SignalPanel entity={entity} />;
    case 'stopSign':    return <StopSignPanel entity={entity} />;
    default:            return <DrawingPanel entity={entity} />;
  }
}

export function PropertiesPanel({ selectedId }: { selectedId: string | null }) {
  const entity = useMapStore((s) => selectedId ? s.entities.get(selectedId) : undefined);

  if (!selectedId || !entity) return null;

  const label = ENTITY_LABELS[entity.entityType] ?? entity.entityType;
  const shortId = entity.id.length > 20 ? `…${entity.id.slice(-14)}` : entity.id;

  return (
    <div className="absolute top-4 right-14 w-64 rounded-lg bg-gray-900/95 border border-white/10 p-3 text-white text-xs shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
      {/* header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
        <span className="font-medium text-sm text-cyan-400">{label}</span>
        <span className="text-white/30 font-mono text-[10px]" title={entity.id}>{shortId}</span>
      </div>

      <EntityDetail entity={entity} />
    </div>
  );
}
