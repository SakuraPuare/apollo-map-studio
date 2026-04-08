/** 经纬度点 (WGS84) */
export interface PointENU {
  x: number; // longitude
  y: number; // latitude
  z?: number;
}

/** 多段线实体 (MVP) */
export interface PolylineEntity {
  id: string;
  entityType: 'polyline';
  points: PointENU[];
}

/** 所有可编辑实体的联合类型 */
export type MapEntity = PolylineEntity;
