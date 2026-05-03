import { Section, Value } from '@/components/ui/form-fields';
import type {
  ClearAreaEntity,
  CrosswalkEntity,
  RSUEntity,
  SpeedBumpEntity,
  YieldSignEntity,
} from '@/types/apollo';

interface SummaryRow {
  label: string;
  value: React.ReactNode;
}

function ReadOnlyAttributes({ rows }: { rows: SummaryRow[] }) {
  return (
    <form>
      <Section title="Attributes">
        {rows.map((row) => (
          <Value key={row.label} label={row.label} value={row.value} />
        ))}
      </Section>
    </form>
  );
}

export function CrosswalkForm({ entity }: { entity: CrosswalkEntity }) {
  return (
    <ReadOnlyAttributes
      rows={[
        { label: 'ID', value: entity.id },
        { label: 'Vertices', value: entity.polygon.points.length || '—' },
        { label: 'Overlaps', value: entity.overlapIds.length || '—' },
      ]}
    />
  );
}

export function SpeedBumpForm({ entity }: { entity: SpeedBumpEntity }) {
  const totalSegments = entity.position.reduce((sum, c) => sum + c.segments.length, 0);
  return (
    <ReadOnlyAttributes
      rows={[
        { label: 'ID', value: entity.id },
        { label: 'Position Curves', value: entity.position.length || '—' },
        { label: 'Segments', value: totalSegments || '—' },
        { label: 'Overlaps', value: entity.overlapIds.length || '—' },
      ]}
    />
  );
}

export function YieldSignForm({ entity }: { entity: YieldSignEntity }) {
  const totalSegments = entity.stopLines.reduce((sum, c) => sum + c.segments.length, 0);
  return (
    <ReadOnlyAttributes
      rows={[
        { label: 'ID', value: entity.id },
        { label: 'Stop Lines', value: entity.stopLines.length || '—' },
        { label: 'Segments', value: totalSegments || '—' },
        { label: 'Overlaps', value: entity.overlapIds.length || '—' },
      ]}
    />
  );
}

export function ClearAreaForm({ entity }: { entity: ClearAreaEntity }) {
  return (
    <ReadOnlyAttributes
      rows={[
        { label: 'ID', value: entity.id },
        { label: 'Vertices', value: entity.polygon.points.length || '—' },
        { label: 'Overlaps', value: entity.overlapIds.length || '—' },
      ]}
    />
  );
}

export function RSUForm({ entity }: { entity: RSUEntity }) {
  return (
    <ReadOnlyAttributes
      rows={[
        { label: 'ID', value: entity.id },
        { label: 'Junction', value: entity.junctionId ?? '—' },
        { label: 'Overlaps', value: entity.overlapIds.length || '—' },
      ]}
    />
  );
}
