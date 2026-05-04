import { bench, describe } from 'vitest';
import { applySnap } from '../mapEventRouter/snap';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { buildPerfEntityMap } from '@/test/fixtures/perfEntities';

function makeActor(state: string) {
  return {
    getSnapshot() {
      return { value: state };
    },
  };
}

const map = {
  getZoom: () => 18,
};

describe('snap integration path', () => {
  for (const scale of [
    { label: '1k', count: 1_000 },
    { label: '5k', count: 5_000 },
  ]) {
    const entities = buildPerfEntityMap(scale.count, 5);
    const actor = makeActor('editingPoint');

    bench(`snap applySnap ${scale.label} entities — editingPoint`, () => {
      useMapStore.setState({ entities });
      useUIStore.setState({ snapEnabled: true, currentSnapTarget: null });
      applySnap(map as never, actor as never, [116.40002, 39.90001]);
    });
  }
});
