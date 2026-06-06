import { useState, useCallback } from 'react';
import {
  FaCarSide,
  FaFolderOpen,
  FaFloppyDisk,
  FaTrash,
  FaTrafficLight,
  FaFileCirclePlus,
} from 'react-icons/fa6';
import { clsx } from 'clsx';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useScenarioStore } from '@/store/scenarioStore';
import {
  loadScenariosFromPicker,
  saveActiveScenario,
  newScenarioFromUI,
} from '@/io/scenario/scenarioLoader';
import { obstacleColor } from '@/io/scenario/scenarioFeatures';
import type { ScenarioFormat } from '@/types/scenario';

function Toolbar({
  busy,
  hasActive,
  newFormat,
  onNewFormat,
  onNew,
  onLoad,
  onSave,
}: {
  busy: boolean;
  hasActive: boolean;
  newFormat: ScenarioFormat;
  onNewFormat: (f: ScenarioFormat) => void;
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-white/[0.07] p-2">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-1.5 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15"
        title="新建空场景"
      >
        <FaFileCirclePlus className="size-3" />
        新建
      </button>
      <select
        aria-label="新建场景格式"
        value={newFormat}
        onChange={(e) => onNewFormat(e.target.value as ScenarioFormat)}
        className="rounded border border-white/10 bg-zinc-800/50 px-1 py-1 text-[10px] text-zinc-300 focus:border-cyan-500/50 focus:outline-none"
        title="新建场景格式"
      >
        <option value="openscenario">openscenario</option>
        <option value="classic">classic</option>
      </select>
      <button
        type="button"
        onClick={onLoad}
        disabled={busy}
        className="flex items-center gap-1.5 rounded bg-cyan-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
      >
        <FaFolderOpen className="size-3" />
        {busy ? '加载中...' : '打开场景'}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!hasActive}
        className="flex items-center gap-1.5 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15 disabled:opacity-40"
      >
        <FaFloppyDisk className="size-3" />
        导出
      </button>
    </div>
  );
}

export function ScenarioBrowser() {
  const loaded = useScenarioStore((s) => s.loaded);
  const activeKey = useScenarioStore((s) => s.activeKey);
  const setActive = useScenarioStore((s) => s.setActive);
  const removeLoaded = useScenarioStore((s) => s.removeLoaded);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<ScenarioFormat>('openscenario');

  const handleLoad = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await loadScenariosFromPicker();
      if (!result) return;
      const parts = [`已加载 ${result.loaded} 个场景`];
      if (result.failed.length > 0) parts.push(`${result.failed.length} 个失败`);
      setMessage(parts.join('，'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载失败');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleNew = useCallback(async () => {
    setMessage(null);
    try {
      if (await newScenarioFromUI(newFormat)) setMessage(`已新建空场景（${newFormat}）`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '新建失败');
    }
  }, [newFormat]);

  const handleSave = useCallback(() => {
    if (saveActiveScenario()) setMessage('已导出当前场景');
    else setMessage('没有可保存的场景');
  }, []);

  return (
    <div className="flex h-full flex-col bg-zinc-950/60 text-xs text-zinc-300">
      <Toolbar
        busy={busy}
        hasActive={!!activeKey}
        newFormat={newFormat}
        onNewFormat={setNewFormat}
        onNew={handleNew}
        onLoad={handleLoad}
        onSave={handleSave}
      />

      {message && (
        <div className="border-b border-white/[0.07] px-3 py-1.5 text-[10px] text-zinc-400">
          {message}
        </div>
      )}

      <ScrollArea className="flex-1">
        {loaded.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-zinc-600">
            选择 Apollo 场景 JSON 文件以加载
          </div>
        ) : (
          <ul className="py-1">
            {loaded.map((entry) => (
              <ScenarioRow
                key={entry.key}
                entryKey={entry.key}
                filename={entry.filename}
                active={entry.key === activeKey}
                obstacleCount={entry.doc.obstacles.length}
                trafficLightCount={entry.doc.trafficLights.length}
                onSelect={setActive}
                onRemove={removeLoaded}
              />
            ))}
          </ul>
        )}
        <ObstacleList />
      </ScrollArea>
    </div>
  );
}

interface ScenarioRowProps {
  entryKey: string;
  filename: string;
  active: boolean;
  obstacleCount: number;
  trafficLightCount: number;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
}

function ScenarioRow({
  entryKey,
  filename,
  active,
  obstacleCount,
  trafficLightCount,
  onSelect,
  onRemove,
}: ScenarioRowProps) {
  return (
    <li
      className={clsx(
        'group flex items-center gap-2 pr-2 hover:bg-white/[0.04]',
        active && 'bg-cyan-500/10',
      )}
    >
      <button
        type="button"
        aria-current={active}
        onClick={() => onSelect(entryKey)}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
      >
        <span
          className={clsx('truncate text-[11px]', active ? 'text-cyan-300' : 'text-zinc-300')}
          title={filename}
        >
          {filename}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500">
          <FaCarSide className="size-2.5" />
          {obstacleCount}
          <FaTrafficLight className="size-2.5" />
          {trafficLightCount}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onRemove(entryKey)}
        className="opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/60 group-hover:opacity-100"
        title="移除"
        aria-label={`移除 ${filename}`}
      >
        <FaTrash className="size-2.5 text-zinc-500 hover:text-red-400" />
      </button>
    </li>
  );
}

function ObstacleList() {
  const activeKey = useScenarioStore((s) => s.activeKey);
  const loaded = useScenarioStore((s) => s.loaded);
  const selectedUid = useScenarioStore((s) => s.selectedObstacleUid);
  const select = useScenarioStore((s) => s.select);
  const doc = loaded.find((l) => l.key === activeKey)?.doc;
  if (!doc || doc.obstacles.length === 0) return null;

  return (
    <div className="border-t border-white/[0.07]">
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        障碍物 ({doc.obstacles.length})
      </div>
      <ul className="pb-2">
        {doc.obstacles.map((ob) => (
          <li key={ob.uid}>
            <button
              type="button"
              aria-current={ob.uid === selectedUid}
              onClick={() => select(ob.uid === selectedUid ? null : ob.uid)}
              className={clsx(
                'flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-white/[0.04]',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60',
                ob.uid === selectedUid && 'bg-cyan-500/10',
              )}
            >
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: obstacleColor(ob.kind) }}
              />
              <span className="truncate text-[11px]">
                {ob.name} · {ob.kind}
              </span>
              {ob.moving && <span className="ml-auto text-[9px] text-zinc-600">动</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
