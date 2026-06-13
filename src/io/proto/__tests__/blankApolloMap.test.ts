import { describe, expect, it } from 'vitest';
import { createBlankApolloMap, setApolloMapBounds } from '../blankApolloMap';

describe('blank Apollo map helpers', () => {
  it('creates a minimal map with the requested projection string', () => {
    expect(createBlankApolloMap('EPSG:TEST')).toEqual({
      header: {
        projection: {
          proj: 'EPSG:TEST',
        },
      },
    });
  });

  it('leaves the map unchanged when bounds are absent', () => {
    const map = createBlankApolloMap('EPSG:TEST');

    setApolloMapBounds(map, null);

    expect(map).toEqual(createBlankApolloMap('EPSG:TEST'));
  });

  it('creates a header when writing bounds onto a bare map object', () => {
    const map: Record<string, unknown> = {};

    setApolloMapBounds(map, [
      [1, 2],
      [3, 4],
    ]);

    expect(map.header).toEqual({
      left: 1,
      bottom: 2,
      right: 3,
      top: 4,
    });
  });

  it('preserves existing header fields while updating bounds', () => {
    const map = createBlankApolloMap('EPSG:TEST');

    setApolloMapBounds(map, [
      [-1, -2],
      [5, 6],
    ]);

    expect(map.header).toEqual({
      projection: {
        proj: 'EPSG:TEST',
      },
      left: -1,
      bottom: -2,
      right: 5,
      top: 6,
    });
  });
});
