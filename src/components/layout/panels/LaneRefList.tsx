/**
 * LaneRefList — clickable list of lane IDs in the Inspector.
 *
 * Replaces the bare count ("Successors: 1") with a row of compact pills,
 * each clickable to navigate to that referenced lane. Uses the editor
 * machine's SELECT_ENTITY event so navigation goes through the same
 * codepath as a canvas click — selection state, store updates, and any
 * subsequent inspector mount all happen identically.
 */
import { clsx } from 'clsx';
import { useEditorActor } from '@/context/EditorContext';
import { useMapStore } from '@/store/mapStore';

interface LaneRefListProps {
  ids: readonly string[];
  /** Show short prefix only (e.g. last 6 chars) to avoid wrapping the row. */
  short?: boolean;
}

export function LaneRefList({ ids, short = true }: LaneRefListProps) {
  const actorRef = useEditorActor();

  if (!ids || ids.length === 0) {
    return <span className="text-zinc-500">—</span>;
  }

  const handleClick = (id: string) => {
    if (!useMapStore.getState().entities.has(id)) return;
    actorRef.send({ type: 'SELECT_ENTITY', id });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const exists = useMapStore.getState().entities.has(id);
        const display = short && id.length > 12 ? `…${id.slice(-6)}` : id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleClick(id)}
            disabled={!exists}
            title={id}
            className={clsx(
              'px-1.5 py-0.5 rounded font-mono text-[10px] leading-none',
              'border transition-colors',
              exists
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 cursor-pointer'
                : 'border-white/5 bg-zinc-800/40 text-zinc-500 cursor-not-allowed line-through',
            )}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Single-id variant — accepts a possibly-null id and renders nothing
 * special when null (the dash). Used for one-off references like
 * `junctionId`.
 */
export function LaneRef({ id }: { id: string | null | undefined }) {
  if (!id) return <span className="text-zinc-500">—</span>;
  return <LaneRefList ids={[id]} />;
}
