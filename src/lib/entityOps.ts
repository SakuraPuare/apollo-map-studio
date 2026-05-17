/**
 * entityOps — anti-corruption facade between Apollo proto domain and UI.
 *
 * UI code imports this module instead of reaching into
 * `src/core/geometry/apolloCompile.ts` directly.
 */

export { cascadeDeleteRefsFull } from './entityOps/cascadeDeleteRefs';
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
export {
  canDuplicateEntity,
  duplicateEntity,
  DEFAULT_DUPLICATE_OFFSET_METERS,
} from './entityOps/duplicate';
export {
  isApolloEntityType,
  isAreaEntity,
  isDrawingEntity,
  isPolygonEditEntity,
} from './entityOps/typeGuards';
