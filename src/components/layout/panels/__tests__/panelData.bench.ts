import { bench, describe } from 'vitest';
import { buildTree } from '../LayerTree/treeBuilder';
import { computeStats, searchEntities } from '../panelData';
import { buildPerfEntityMap } from '@/test/fixtures/perfEntities';

describe('panel entity data builders', () => {
  for (const scale of [
    { label: '10k', count: 10_000 },
    { label: '50k', count: 50_000 },
  ]) {
    const entities = buildPerfEntityMap(scale.count);

    bench(`panel ${scale.label} — build layer tree`, () => {
      buildTree(entities);
    });

    bench(`panel ${scale.label} — compute outline stats`, () => {
      computeStats(entities);
    });

    bench(`panel ${scale.label} — search miss scan`, () => {
      searchEntities(entities, 'not-present');
    });
  }
});
