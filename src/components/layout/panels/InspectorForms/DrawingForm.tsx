import { Section, Value } from '@/components/ui/form-fields';
import type { MapEntity } from '@/types/entities';

export function DrawingForm({ entity }: { entity: MapEntity }) {
  const pointCount = (() => {
    if ('points' in entity && Array.isArray((entity as { points: unknown[] }).points)) {
      return (entity as { points: unknown[] }).points.length;
    }
    if ('anchors' in entity && Array.isArray((entity as { anchors: unknown[] }).anchors)) {
      return (entity as { anchors: unknown[] }).anchors.length;
    }
    if ('polygon' in entity && (entity as { polygon: { points: unknown[] } }).polygon?.points) {
      return (entity as { polygon: { points: unknown[] } }).polygon.points.length;
    }
    return '—';
  })();

  return (
    <Section title="Geometry">
      <Value label="ID" value={entity.id} />
      <Value label="Vertices" value={pointCount} />
    </Section>
  );
}
