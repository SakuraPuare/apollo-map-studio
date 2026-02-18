import proj4 from 'proj4'

export interface Projection {
  toENU: (lng: number, lat: number) => [number, number] // [x=East, y=North]
  toLngLat: (x: number, y: number) => [number, number] // [lng, lat]
  projString: string
  originLat: number
  originLon: number
}

/**
 * Create a Transverse Mercator projection centered at (originLat, originLon).
 * This matches Apollo's map projection format:
 *   "+proj=tmerc +lat_0={lat} +lon_0={lon} +k=1 +ellps=WGS84 +no_defs"
 */
export function createProjection(originLat: number, originLon: number): Projection {
  const projString = `+proj=tmerc +lat_0=${originLat} +lon_0=${originLon} +k=1 +ellps=WGS84 +no_defs`

  return {
    projString,
    originLat,
    originLon,
    toENU: (lng: number, lat: number): [number, number] => {
      const [x, y] = proj4('WGS84', projString, [lng, lat])
      return [x, y]
    },
    toLngLat: (x: number, y: number): [number, number] => {
      const [lng, lat] = proj4(projString, 'WGS84', [x, y])
      return [lng, lat]
    },
  }
}

let _projection: Projection | null = null

export function setGlobalProjection(originLat: number, originLon: number): Projection {
  _projection = createProjection(originLat, originLon)
  return _projection
}

export function getGlobalProjection(): Projection | null {
  return _projection
}

/**
 * Convert GeoJSON coordinate array [lng, lat] to PointENU {x, y, z}
 */
export function lngLatToENU(lng: number, lat: number, z = 0): { x: number; y: number; z: number } {
  if (!_projection) throw new Error('Projection not initialized')
  const [x, y] = _projection.toENU(lng, lat)
  return { x, y, z }
}
