import { bench, describe } from 'vitest';
import { chunkArray } from '../chunking';
import { buildPerfEntities } from '@/test/fixtures/perfEntities';

describe('main-thread chunk preparation', () => {
  for (const scale of [
    { label: '10k', count: 10_000 },
    { label: '50k', count: 50_000 },
  ]) {
    const entities = buildPerfEntities(scale.count);

    bench(`chunking ${scale.label} entities — slice 2k chunks`, () => {
      for (const chunk of chunkArray(entities, 2_000)) {
        void chunk.items;
      }
    });
  }
});
