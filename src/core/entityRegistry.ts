import type { IconType } from 'react-icons';
import {
  FaBan,
  FaBezierCurve,
  FaCircleNodes,
  FaDrawPolygon,
  FaPersonWalking,
  FaRegCircle,
  FaRegFileLines,
  FaRegSquare,
  FaRoad,
  FaRoadBarrier,
  FaSatelliteDish,
  FaSquareParking,
  FaTrafficLight,
  FaVectorSquare,
} from 'react-icons/fa6';
import {
  BsFillSignIntersectionFill,
  BsIntersect,
  BsSignStop,
  BsSignYieldFill,
} from 'react-icons/bs';
import { BiShapePolygon } from 'react-icons/bi';
import { PiWarningDiamondFill } from 'react-icons/pi';
import type { MapEntity } from '@/types/entities';

export type EntityType = MapEntity['entityType'];

export interface EntityRegistryEntry {
  type: EntityType;
  label: string;
  pluralLabel: string;
  icon: IconType;
  color: string;
  topLevelOrder: number;
}

export const ENTITY_REGISTRY = [
  {
    type: 'road',
    label: '道路',
    pluralLabel: 'Roads',
    icon: FaRoad,
    color: '#8b9bb4',
    topLevelOrder: 10,
  },
  {
    type: 'junction',
    label: '路口',
    pluralLabel: 'Junctions',
    icon: BsFillSignIntersectionFill,
    color: '#ffcc00',
    topLevelOrder: 20,
  },
  {
    type: 'lane',
    label: '车道',
    pluralLabel: 'Lanes',
    icon: FaRoad,
    color: '#4a9eff',
    topLevelOrder: 30,
  },
  {
    type: 'signal',
    label: '信号灯',
    pluralLabel: 'Signals',
    icon: FaTrafficLight,
    color: '#22cc44',
    topLevelOrder: 40,
  },
  {
    type: 'crosswalk',
    label: '人行横道',
    pluralLabel: 'Crosswalks',
    icon: FaPersonWalking,
    color: '#ffffff',
    topLevelOrder: 50,
  },
  {
    type: 'stopSign',
    label: '停车标志',
    pluralLabel: 'Stop Signs',
    icon: BsSignStop,
    color: '#ff0000',
    topLevelOrder: 60,
  },
  {
    type: 'yieldSign',
    label: '让行标志',
    pluralLabel: 'Yield Signs',
    icon: BsSignYieldFill,
    color: '#ff6600',
    topLevelOrder: 70,
  },
  {
    type: 'speedBump',
    label: '减速带',
    pluralLabel: 'Speed Bumps',
    icon: PiWarningDiamondFill,
    color: '#ffaa00',
    topLevelOrder: 80,
  },
  {
    type: 'clearArea',
    label: '禁停区',
    pluralLabel: 'Clear Areas',
    icon: FaBan,
    color: '#ff4466',
    topLevelOrder: 90,
  },
  {
    type: 'parkingSpace',
    label: '车位',
    pluralLabel: 'Parking Spaces',
    icon: FaSquareParking,
    color: '#7c5cbf',
    topLevelOrder: 100,
  },
  {
    type: 'parkingLot',
    label: '停车场',
    pluralLabel: 'Parking Lots',
    icon: FaSquareParking,
    color: '#7c5cbf',
    topLevelOrder: 110,
  },
  {
    type: 'pncJunction',
    label: 'PNC 路口',
    pluralLabel: 'PNC Junctions',
    icon: BsFillSignIntersectionFill,
    color: '#ff9933',
    topLevelOrder: 120,
  },
  {
    type: 'rsu',
    label: 'RSU',
    pluralLabel: 'RSUs',
    icon: FaSatelliteDish,
    color: '#66aaff',
    topLevelOrder: 130,
  },
  {
    type: 'area',
    label: '区域',
    pluralLabel: 'Areas',
    icon: BiShapePolygon,
    color: '#66aaff',
    topLevelOrder: 140,
  },
  {
    type: 'barrierGate',
    label: '道闸',
    pluralLabel: 'Barrier Gates',
    icon: FaRoadBarrier,
    color: '#aa66ff',
    topLevelOrder: 150,
  },
  {
    type: 'overlap',
    label: 'Overlap',
    pluralLabel: 'Overlaps',
    icon: BsIntersect,
    color: '#a1a1aa',
    topLevelOrder: 160,
  },
  {
    type: 'speedControl',
    label: '限速',
    pluralLabel: 'Speed Controls',
    icon: FaCircleNodes,
    color: '#f97316',
    topLevelOrder: 170,
  },
  {
    type: 'polyline',
    label: '折线',
    pluralLabel: 'Polylines',
    icon: FaVectorSquare,
    color: '#a1a1aa',
    topLevelOrder: 180,
  },
  {
    type: 'bezier',
    label: '贝塞尔曲线',
    pluralLabel: 'Bezier Curves',
    icon: FaBezierCurve,
    color: '#ec4899',
    topLevelOrder: 190,
  },
  {
    type: 'arc',
    label: '圆弧',
    pluralLabel: 'Arcs',
    icon: FaRegCircle,
    color: '#f59e0b',
    topLevelOrder: 200,
  },
  {
    type: 'rect',
    label: '矩形',
    pluralLabel: 'Rectangles',
    icon: FaRegSquare,
    color: '#ef4444',
    topLevelOrder: 210,
  },
  {
    type: 'polygon',
    label: '多边形',
    pluralLabel: 'Polygons',
    icon: FaDrawPolygon,
    color: '#a855f7',
    topLevelOrder: 220,
  },
  {
    type: 'catmullRom',
    label: 'CatmullRom 曲线',
    pluralLabel: 'CatmullRom Curves',
    icon: FaBezierCurve,
    color: '#ec4899',
    topLevelOrder: 230,
  },
] satisfies EntityRegistryEntry[];

export const ENTITY_MAP = new Map<EntityType, EntityRegistryEntry>(
  ENTITY_REGISTRY.map((entry) => [entry.type, entry]),
);

export const TOP_LEVEL_ENTITY_TYPES = [...ENTITY_REGISTRY]
  .sort((a, b) => a.topLevelOrder - b.topLevelOrder)
  .map((entry) => entry.type);

export function getEntityEntry(entityType: string): EntityRegistryEntry | undefined {
  return ENTITY_MAP.get(entityType as EntityType);
}

export function getEntityIcon(entityType: string): IconType {
  return getEntityEntry(entityType)?.icon ?? FaRegFileLines;
}

export function getEntityLabel(entityType: string): string {
  return getEntityEntry(entityType)?.label ?? entityType;
}

export function getEntityPluralLabel(entityType: string): string {
  return getEntityEntry(entityType)?.pluralLabel ?? entityType;
}

export function getEntityColor(entityType: string): string | undefined {
  return getEntityEntry(entityType)?.color;
}
