import { useMemo, useState } from 'react';
import {
  FaArrowsRotate,
  FaChartSimple,
  FaCompress,
  FaRotate,
  FaTriangleExclamation,
} from 'react-icons/fa6';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  collectGeometryStats,
  rederiveEditableGeometry,
  simplifyRoadGeometry,
  type GeometryToolResult,
} from '@/core/toolbox';
import { useMapStore } from '@/store/mapStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';

type BusyTool = 'simplify' | 'derive' | 'overlap';
type ResultTone = 'ok' | 'warn' | 'error';

interface ToolResultMessage {
  tone: ResultTone;
  title: string;
  detail: string;
}

const DEFAULT_TOLERANCE_METERS = '0.25';

export function ToolboxPanel() {
  const entities = useMapStore((s) => s.entities);
  const stats = useMemo(() => collectGeometryStats(entities), [entities]);
  const [toleranceMeters, setToleranceMeters] = useState(DEFAULT_TOLERANCE_METERS);
  const [busyTool, setBusyTool] = useState<BusyTool | null>(null);
  const [result, setResult] = useState<ToolResultMessage | null>(null);

  const parsedTolerance = Number(toleranceMeters);
  const toleranceValid = Number.isFinite(parsedTolerance) && parsedTolerance > 0;
  const disabled = busyTool !== null;

  return (
    <ScrollArea className="h-full bg-zinc-950/60 text-xs text-zinc-300">
      <div className="border-b border-white/[0.07] px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <FaChartSimple className="h-3.5 w-3.5" />
          <span>工具箱</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Metric label="实体" value={stats.entityCount} />
          <Metric label="曲线" value={stats.curveCount} />
          <Metric label="点数" value={stats.pointCount} />
        </div>
      </div>

      <ToolSection title="道路点数下采样">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] text-zinc-500">误差范围 m</span>
            <input
              type="range"
              min="0.01"
              max="5"
              step="0.01"
              value={toleranceValid ? parsedTolerance : 0.25}
              disabled={disabled}
              onChange={(event) => setToleranceMeters(event.target.value)}
              className="w-full accent-cyan-400"
            />
          </label>
          <input
            type="number"
            min="0.01"
            max="100"
            step="0.05"
            value={toleranceMeters}
            disabled={disabled}
            onChange={(event) => setToleranceMeters(event.target.value)}
            className="h-7 rounded border border-white/10 bg-zinc-900 px-2 text-right font-mono text-[11px] text-zinc-200 outline-none focus:border-cyan-400/60"
          />
        </div>
        <ToolButton
          icon={<FaCompress className="h-3.5 w-3.5" />}
          label={busyTool === 'simplify' ? '处理中' : '应用下采样'}
          disabled={disabled || !toleranceValid}
          onClick={() => void runSimplify(parsedTolerance, setBusyTool, setResult)}
        />
      </ToolSection>

      <ToolSection title="几何维护">
        <div className="grid grid-cols-1 gap-2">
          <ToolButton
            icon={<FaRotate className="h-3.5 w-3.5" />}
            label={busyTool === 'derive' ? '处理中' : '重算派生字段'}
            disabled={disabled}
            onClick={() => void runRederive(setBusyTool, setResult)}
          />
          <ToolButton
            icon={<FaArrowsRotate className="h-3.5 w-3.5" />}
            label={busyTool === 'overlap' ? '处理中' : '重算 Overlap'}
            disabled={disabled}
            onClick={() => void runOverlap(setBusyTool, setResult)}
          />
        </div>
      </ToolSection>

      {result && (
        <div className="px-3 py-3">
          <ResultStrip message={result} />
        </div>
      )}
    </ScrollArea>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1.5">
      <div className="mb-1 text-[10px] leading-none text-zinc-500">{label}</div>
      <div className="truncate font-mono text-sm leading-none text-cyan-300">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function ToolSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.07] px-3 py-3">
      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ToolButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-full items-center justify-center gap-2 rounded border border-cyan-400/20 bg-cyan-400/10 px-2 text-[11px] font-medium text-cyan-200 transition-colors hover:border-cyan-300/40 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ResultStrip({ message }: { message: ToolResultMessage }) {
  const toneClass =
    message.tone === 'error'
      ? 'border-red-400/20 bg-red-400/10 text-red-200'
      : message.tone === 'warn'
        ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
        : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';

  return (
    <div className={`rounded border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[11px] font-medium">
        {message.tone !== 'ok' && <FaTriangleExclamation className="h-3.5 w-3.5" />}
        <span>{message.title}</span>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-zinc-400">{message.detail}</div>
    </div>
  );
}

async function runSimplify(
  toleranceMeters: number,
  setBusyTool: (tool: BusyTool | null) => void,
  setResult: (message: ToolResultMessage) => void,
) {
  await runTool('simplify', setBusyTool, setResult, async () => {
    const entities = useMapStore.getState().entities;
    const result = simplifyRoadGeometry(entities, { toleranceMeters });
    const changed = useMapStore.getState().updateEntities(result.changes);
    return formatGeometryResult('道路点数下采样', result, changed);
  });
}

async function runRederive(
  setBusyTool: (tool: BusyTool | null) => void,
  setResult: (message: ToolResultMessage) => void,
) {
  await runTool('derive', setBusyTool, setResult, async () => {
    const entities = useMapStore.getState().entities;
    const result = rederiveEditableGeometry(entities);
    const changed = useMapStore.getState().updateEntities(result.changes);
    return {
      tone: changed > 0 ? 'ok' : 'warn',
      title: '派生字段重算',
      detail: changed > 0 ? `已更新 ${changed.toLocaleString()} 个实体` : '没有需要更新的实体',
    };
  });
}

async function runOverlap(
  setBusyTool: (tool: BusyTool | null) => void,
  setResult: (message: ToolResultMessage) => void,
) {
  await runTool('overlap', setBusyTool, setResult, async () => {
    const stats = await useMapStore.getState().recomputeOverlapsAsync();
    if (!stats) {
      return { tone: 'warn', title: 'Overlap 重算', detail: '当前地图没有实体' };
    }
    return {
      tone: 'ok',
      title: 'Overlap 重算',
      detail: `配对 ${stats.pairsTested.toLocaleString()}，命中 ${stats.pairsMatched.toLocaleString()}，新增 ${stats.overlapsCreated.toLocaleString()}，移除 ${stats.overlapsRemoved.toLocaleString()}`,
    };
  });
}

async function runTool(
  tool: BusyTool,
  setBusyTool: (tool: BusyTool | null) => void,
  setResult: (message: ToolResultMessage) => void,
  operation: () => Promise<ToolResultMessage> | ToolResultMessage,
) {
  const taskId = `toolbox:${tool}`;
  setBusyTool(tool);
  useTaskProgressStore.getState().beginTask({
    id: taskId,
    label: '工具箱处理中',
    progress: null,
    visibleAfterMs: 300,
  });
  await nextFrame();
  try {
    setResult(await operation());
  } catch (error) {
    setResult({
      tone: 'error',
      title: '工具执行失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    useTaskProgressStore.getState().endTask(taskId);
    setBusyTool(null);
  }
}

function formatGeometryResult(
  title: string,
  result: GeometryToolResult,
  changedEntities: number,
): ToolResultMessage {
  const removedPoints = result.before.pointCount - result.after.pointCount;
  if (changedEntities === 0 || removedPoints <= 0) {
    return { tone: 'warn', title, detail: '没有可下采样的道路或车道点' };
  }
  return {
    tone: 'ok',
    title,
    detail: `已更新 ${changedEntities.toLocaleString()} 个实体，点数 ${result.before.pointCount.toLocaleString()} → ${result.after.pointCount.toLocaleString()}`,
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
