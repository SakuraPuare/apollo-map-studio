/**
 * entityOps — anti-corruption facade between Apollo proto domain and UI.
 *
 * UI code imports this module instead of reaching into
 * `src/core/geometry/apolloCompile.ts` directly.
 */
import type { ApolloEntity } from '@/types/apollo';
import type { BezierAnchorData, DrawingEntity, GeoPoint, MapEntity } from '@/types/entities';

export type { ApolloEntity, BezierAnchorData, DrawingEntity, GeoPoint, MapEntity };

export { cascadeDeleteRefs } from './entityOps/cascadeDeleteRefs';
export {
  compileEntity,
  createEntity,
  deleteVertex,
  entityCoords,
  getEditPoints,
  moveEntity,
  setAllEditPoints,
  setEditPoint,
} from './entityOps/edit';
export {
  canReparent,
  reparent,
  type ParentTarget,
  type ReparentResult,
} from './entityOps/reparent';
export { isApolloEntityType, isAreaEntity, isDrawingEntity } from './entityOps/typeGuards';
