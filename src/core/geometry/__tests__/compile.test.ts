import { describe, expect, it } from 'vitest';
import {
  compileColdFeatures,
  entityBBox,
  entityCoords,
  entityRenderCoords,
  isAreaEntity,
} from '../compile';
import type {
  ArcEntity,
  BezierEntity,
  CatmullRomEntity,
  PolygonEntity,
  PolylineEntity,
  RectEntity,
} from '@/types/entities';
import type { JunctionEntity, RSUEntity } from '@/types/apollo';

describe('compileColdFeatures for drawing entities', () => {
  it('compiles a polyline with stable feature id and properties', () => {
    const entity: PolylineEntity = {
      id: 'polyline-1',
      entityType: 'polyline',
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    };

    const [feature] = compileColdFeatures(entity);

    expect(feature).toMatchObject({
      id: 'polyline-1:shape',
      type: 'Feature',
      properties: {
        id: 'polyline-1',
        entityType: 'polyline',
        color: '#00d4ff',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
    });
  });

  it('compiles polygons and rectangles as closed polygon geometries', () => {
    const polygon: PolygonEntity = {
      id: 'polygon-1',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    const rect: RectEntity = {
      id: 'rect-1',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 2, y: 1 },
      rotation: 0,
    };

    const polygonFeature = compileColdFeatures(polygon)[0]!;
    const rectFeature = compileColdFeatures(rect)[0]!;

    expect(polygonFeature.geometry.type).toBe('Polygon');
    expect((polygonFeature.geometry as GeoJSON.Polygon).coordinates[0]).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 0],
    ]);
    expect(rectFeature).toMatchObject({
      id: 'rect-1:shape',
      properties: { entityType: 'rect', color: '#ff4444' },
      geometry: { type: 'Polygon' },
    });
    expect((rectFeature.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5);
  });

  it('compiles Bezier and arc entities to sampled line strings', () => {
    const bezier: BezierEntity = {
      id: 'bezier-1',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 0.5, y: 1 } },
        { point: { x: 1, y: 0 }, handleIn: { x: 0.5, y: 1 }, handleOut: null },
      ],
    };
    const arc: ArcEntity = {
      id: 'arc-1',
      entityType: 'arc',
      start: { x: 0, y: 0 },
      mid: { x: 1, y: 1 },
      end: { x: 2, y: 0 },
    };

    const bezierCoords = (compileColdFeatures(bezier)[0]!.geometry as GeoJSON.LineString)
      .coordinates;
    const arcCoords = (compileColdFeatures(arc)[0]!.geometry as GeoJSON.LineString).coordinates;

    expect(bezierCoords[0]).toEqual([0, 0]);
    expect(bezierCoords[bezierCoords.length - 1]).toEqual([1, 0]);
    expect(bezierCoords.length).toBeGreaterThan(2);
    expect(arcCoords[0]![0]).toBeCloseTo(0, 12);
    expect(arcCoords[0]![1]).toBeCloseTo(0, 12);
    expect(arcCoords[arcCoords.length - 1]![0]).toBeCloseTo(2, 12);
    expect(arcCoords[arcCoords.length - 1]![1]).toBeCloseTo(0, 12);
    expect(arcCoords.length).toBeGreaterThan(3);
  });

  it('delegates Apollo entities to the Apollo compiler', () => {
    const junction: JunctionEntity = {
      id: 'junction-1',
      entityType: 'junction',
      polygon: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      overlapIds: [],
    };

    const [feature] = compileColdFeatures(junction);

    expect(feature).toMatchObject({
      id: 'junction-1:shape',
      properties: { id: 'junction-1', entityType: 'junction' },
      geometry: { type: 'Polygon' },
    });
  });
});

describe('compile geometry helpers', () => {
  it('entityCoords returns raw control coordinates for drawing entities', () => {
    const catmull: CatmullRomEntity = {
      id: 'cat-1',
      entityType: 'catmullRom',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
    };

    expect(entityCoords(catmull)).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
    ]);
  });

  it('entityRenderCoords samples Catmull-Rom while other drawing entities reuse entityCoords', () => {
    const catmull: CatmullRomEntity = {
      id: 'cat-1',
      entityType: 'catmullRom',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
    };
    const polyline: PolylineEntity = {
      id: 'polyline-1',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };

    expect(entityRenderCoords(catmull).length).toBeGreaterThan(entityCoords(catmull).length);
    expect(entityRenderCoords(polyline)).toEqual(entityCoords(polyline));
  });

  it('entityBBox returns extrema from sampled entity coordinates', () => {
    const polygon: PolygonEntity = {
      id: 'polygon-1',
      entityType: 'polygon',
      points: [
        { x: 2, y: 3 },
        { x: -1, y: 4 },
        { x: 5, y: -2 },
      ],
    };

    expect(entityBBox(polygon)).toEqual([-1, -2, 5, 4]);
  });

  it('entityBBox returns infinite sentinels for unsupported Apollo entities with no geometry', () => {
    const rsu: RSUEntity = {
      id: 'rsu-1',
      entityType: 'rsu',
      junctionId: null,
      overlapIds: [],
    };

    expect(entityCoords(rsu)).toEqual([]);
    expect(compileColdFeatures(rsu)).toEqual([]);
    expect(entityBBox(rsu)).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
  });

  it('isAreaEntity is true only for drawing areas and Apollo area renderers', () => {
    const rect: RectEntity = {
      id: 'rect-1',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 1, y: 1 },
      rotation: 0,
    };
    const polygon: PolygonEntity = {
      id: 'polygon-1',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    const polyline: PolylineEntity = {
      id: 'line-1',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    const junction: JunctionEntity = {
      id: 'junction-1',
      entityType: 'junction',
      polygon: { points: polygon.points },
      overlapIds: [],
    };

    expect(isAreaEntity(rect)).toBe(true);
    expect(isAreaEntity(polygon)).toBe(true);
    expect(isAreaEntity(junction)).toBe(true);
    expect(isAreaEntity(polyline)).toBe(false);
  });
});
