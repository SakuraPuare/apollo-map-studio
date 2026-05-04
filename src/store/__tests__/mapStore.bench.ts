import { bench, describe } from 'vitest';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '../mapStore';
import { buildPerfEntityMap, makePerfLane } from '@/test/fixtures/perfEntities';
import type { MapEntity } from '@/types/entities';

useLicenseStore.setState({
  state: {
    status: 'trial',
    canEdit: true,
    machineCode: '',
    trialStart: 0,
    trialEnd: 0,
    daysRemaining: 7,
    hoursRemaining: 168,
    license: null,
    checkedAt: 0,
    reason: '',
  },
  initialized: true,
});

function seedStore(entities: Map<string, MapEntity>) {
  useMapStore.temporal.getState().pause();
  useMapStore.setState({ entities });
}

describe('map store write transactions', () => {
  for (const scale of [
    { label: '10k', count: 10_000 },
    { label: '25k', count: 25_000 },
  ]) {
    const entities = buildPerfEntityMap(scale.count);

    bench(
      `mapStore ${scale.label} — update lane transaction`,
      () => {
        seedStore(entities);
        useMapStore.getState().updateEntity('lane_0', makePerfLane('lane_0', 0, 5));
      },
      { iterations: 10 },
    );

    bench(
      `mapStore ${scale.label} — remove lane transaction`,
      () => {
        seedStore(entities);
        useMapStore.getState().removeEntity('lane_0');
      },
      { iterations: 10 },
    );

    bench(
      `mapStore ${scale.label} — batchImport transaction`,
      () => {
        seedStore(new Map());
        useMapStore.getState().batchImport([...entities.values()]);
      },
      { iterations: 3 },
    );
  }
});
