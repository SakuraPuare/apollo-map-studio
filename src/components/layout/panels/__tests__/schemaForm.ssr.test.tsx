import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { EntityForm } from '../InspectorForms';
import { OverlapForm } from '../InspectorForms/overlap';
import { SchemaForm } from '../SchemaForm';
import { Input } from '@/components/ui/form-fields';
import {
  REGION_OVERLAPS_OVERRIDE_PATH,
  laneIsMergeOverridePath,
} from '@/core/elements/overlap/overridePaths';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { EntitySchema } from '@/types/inspectorSchema';
import type { LaneEntity, OverlapEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

const initialUIState = useUIStore.getState();

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function lane(overrides: Partial<LaneEntity> = {}): LaneEntity {
  return {
    id: 'lane_schema_ssr',
    entityType: 'lane',
    centralCurve: { segments: [] },
    leftBoundary: {
      curve: { segments: [] },
      length: 10,
      virtual: false,
      boundaryType: [{ s: 0, types: ['SOLID_WHITE'] }],
    },
    rightBoundary: {
      curve: { segments: [] },
      length: 10,
      virtual: false,
      boundaryType: [{ s: 0, types: ['DOTTED_YELLOW'] }],
    },
    length: 10,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 8,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: 1.75 }],
    rightSamples: [{ s: 0, width: 1.8 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
    ...overrides,
  };
}

const schema = {
  id: 'schema-form-ssr',
  validation: z.object({
    kind: z.enum(['CITY_DRIVING', 'BIKING']),
    width: z.number().min(0.5).max(5),
  }),
  sectionOrder: ['Editable', 'Computed'],
  fields: [
    {
      kind: 'enum',
      name: 'kind',
      label: 'Kind',
      section: 'Editable',
      options: ['CITY_DRIVING', 'BIKING'],
      read: (entity: LaneEntity) => (entity.type === 'BIKING' ? 'BIKING' : 'CITY_DRIVING'),
      write: (entity: LaneEntity, kind: 'CITY_DRIVING' | 'BIKING') => ({
        ...entity,
        type: kind,
      }),
    },
    {
      kind: 'number',
      name: 'width',
      label: 'Width',
      section: 'Editable',
      min: 0.5,
      max: 5,
      step: 0.25,
      read: (entity: LaneEntity) => entity.leftSamples[0]?.width ?? 0,
      write: (entity: LaneEntity, width: number) => ({
        ...entity,
        leftSamples: [{ s: 0, width }],
      }),
    },
  ],
  readonly: [
    {
      kind: 'readonly',
      label: 'ID',
      section: 'Computed',
      compute: (entity: LaneEntity) => entity.id,
    },
    {
      kind: 'readonly',
      label: 'Length',
      section: 'Computed',
      compute: (entity: LaneEntity) => `${(entity.length ?? 0).toFixed(2)} m`,
    },
  ],
} satisfies EntitySchema<
  LaneEntity,
  {
    kind: 'CITY_DRIVING' | 'BIKING';
    width: number;
  }
>;

function overlap(_userOverrides: string[] = []): OverlapEntity {
  return {
    id: 'overlap_schema_ssr',
    entityType: 'overlap',
    objects: [
      {
        objectType: 'lane',
        objectId: 'lane_schema_ssr_a',
        laneOverlapInfo: { startS: 1, endS: 3, isMerge: true },
      },
      {
        objectType: 'lane',
        objectId: 'lane_schema_ssr_b',
        laneOverlapInfo: { startS: 4, endS: 8, isMerge: false },
      },
    ],
    regionOverlaps: [
      {
        id: 'region_schema_ssr',
        polygons: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
      },
    ],
    _userOverrides,
  };
}

function ErrorFieldHarness() {
  const methods = useForm<{ width: number }>({
    defaultValues: { width: 0 },
    errors: {
      width: {
        type: 'manual',
        message: 'Width must be at least 0.5',
      },
    },
  });

  return (
    <FormProvider {...methods}>
      <form>
        <Input name="width" label="Width" type="number" />
      </form>
    </FormProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  useUIStore.setState(initialUIState, true);
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
});

describe('SchemaForm SSR rendering details', () => {
  it('renders enum and number fields with SSR-stable labels and input attributes', () => {
    const html = render(<SchemaForm schema={schema} entity={lane()} />);

    expect(html).toContain('Editable');
    expect(html).toContain('Kind');
    expect(html).toContain('name="kind"');
    expect(html).toMatch(/<option value="CITY_DRIVING"[^>]*>CITY_DRIVING<\/option>/);
    expect(html).toMatch(/<option value="BIKING"[^>]*>BIKING<\/option>/);
    expect(html).toContain('Width');
    expect(html).toContain('type="number"');
    expect(html).toContain('min="0.5"');
    expect(html).toContain('max="5"');
    expect(html).toContain('step="0.25"');
    expect(html).toContain('name="width"');
  });

  it('renders read-only schema rows as values instead of form controls', () => {
    const html = render(<SchemaForm schema={schema} entity={lane()} />);

    expect(html.indexOf('Editable')).toBeLessThan(html.indexOf('Computed'));
    expect(html).toContain('ID');
    expect(html).toContain('lane_schema_ssr');
    expect(html).toContain('Length');
    expect(html).toContain('10.00 m');
    expect(html).not.toContain('name="ID"');
    expect(html).not.toContain('name="Length"');
  });

  it('falls back to the geometry form when no entity schema or renderer is registered', () => {
    const entity: MapEntity = {
      id: 'unregistered_schema_ssr',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };

    const html = render(<EntityForm entity={entity} />);

    expect(html).toContain('Geometry');
    expect(html).toContain('unregistered_schema_ssr');
    expect(html).toContain('Vertices');
    expect(html).toContain('2');
    expect(html).not.toContain('Attributes');
  });

  it('renders optional overlap override badges for pinned and auto-derived states', () => {
    const pinnedHtml = render(
      <OverlapForm entity={overlap([laneIsMergeOverridePath(0), REGION_OVERLAPS_OVERRIDE_PATH])} />,
    );
    const autoHtml = render(<OverlapForm entity={overlap()} />);

    expect(pinnedHtml).toContain('Lane × Lane Semantics');
    expect(pinnedHtml).toContain('Region Overlaps');
    expect(pinnedHtml.match(/pinned ×/g)).toHaveLength(2);
    expect(pinnedHtml).toContain('Release pin');
    expect(autoHtml).toContain('auto');
    expect(autoHtml).toContain('auto-derived');
    expect(autoHtml).toContain('Pin → freeze current region polygons');
  });

  it('renders reachable validation error text from field context during SSR', () => {
    const html = render(<ErrorFieldHarness />);

    expect(html).toContain('Width must be at least 0.5');
    expect(html).toContain('text-red-400');
  });
});
