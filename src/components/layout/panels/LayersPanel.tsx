import { ChevronRight, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { clsx } from 'clsx';
import { useState, useMemo } from 'react';

interface LayerGroup {
  type: string;
  label: string;
  count: number;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  entities: { id: string; label: string }[];
}

const TYPE_LABELS: Record<string, string> = {
  lane: '车道 Lanes',
  junction: '路口 Junctions',
  parkingSpace: '车位 Parking',
  signal: '信号灯 Signals',
  crosswalk: '人行横道 Crosswalks',
  stopSign: '停车标志 StopSigns',
  speedBump: '减速带 SpeedBumps',
  polyline: '折线 Polylines',
  bezier: '贝塞尔 Beziers',
  arc: '圆弧 Arcs',
  rect: '矩形 Rectangles',
  polygon: '多边形 Polygons',
  catmullRom: 'CatmullRom',
};

export function LayersPanel() {
  const entities = useMapStore((s) => s.entities);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['lane']));
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [lockedGroups, setLockedGroups] = useState<Set<string>>(new Set());

  // Group entities by type
  const groups = useMemo(() => {
    const grouped = new Map<string, LayerGroup>();

    entities.forEach((entity) => {
      const type = entity.entityType;
      if (!grouped.has(type)) {
        grouped.set(type, {
          type,
          label: TYPE_LABELS[type] || type,
          count: 0,
          visible: !hiddenGroups.has(type),
          locked: lockedGroups.has(type),
          expanded: expandedGroups.has(type),
          entities: [],
        });
      }
      const group = grouped.get(type)!;
      group.count++;
      group.entities.push({
        id: entity.id,
        label: entity.id.length > 16 ? `...${entity.id.slice(-12)}` : entity.id,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  }, [entities, expandedGroups, hiddenGroups, lockedGroups]);

  const toggleExpand = (type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleVisibility = (type: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleLock = (type: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLockedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900/50">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/[0.07]">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Layers</h2>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-xs text-zinc-600 text-center">
            No entities yet
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.type}>
              {/* Group header */}
              <div
                onClick={() => toggleExpand(group.type)}
                className={clsx(
                  'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-white/5 transition-colors',
                  group.expanded && 'bg-white/[0.03]'
                )}
              >
                <ChevronRight
                  className={clsx(
                    'w-3.5 h-3.5 text-zinc-600 transition-transform',
                    group.expanded && 'rotate-90'
                  )}
                />
                <span className="flex-1 text-xs text-zinc-300 truncate">{group.label}</span>
                <span className="text-[10px] font-mono text-zinc-600 mr-1">{group.count}</span>

                {/* Visibility toggle */}
                <button
                  onClick={(e) => toggleVisibility(group.type, e)}
                  className="p-0.5 hover:bg-white/10 rounded"
                >
                  {hiddenGroups.has(group.type) ? (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                </button>

                {/* Lock toggle */}
                <button
                  onClick={(e) => toggleLock(group.type, e)}
                  className="p-0.5 hover:bg-white/10 rounded"
                >
                  {lockedGroups.has(group.type) ? (
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-zinc-600" />
                  )}
                </button>
              </div>

              {/* Expanded entities */}
              {group.expanded && (
                <div className="pl-5 pr-2">
                  {group.entities.slice(0, 50).map((entity) => (
                    <div
                      key={entity.id}
                      className="py-0.5 px-2 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded cursor-pointer truncate"
                    >
                      {entity.label}
                    </div>
                  ))}
                  {group.entities.length > 50 && (
                    <div className="py-0.5 px-2 text-[10px] text-zinc-600">
                      +{group.entities.length - 50} more...
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
