/**
 * Apollo entity geometry facade.
 *
 * Public imports stay on `@/core/geometry/apolloCompile`; implementation
 * lives in focused modules under `apolloCompile/`.
 */
export { pointsToCurve } from './apolloCompile/conversions';
export { offsetPolylineDeg } from './apolloCompile/offsetPolyline';
export {
  apolloEntityCoords,
  deleteApolloVertex,
  getApolloEditPoints,
  isApolloAreaEntity,
  isApolloPolygonEditPoints,
  moveApolloEntity,
  setAllApolloEditPoints,
  setApolloEditPoint,
} from './apolloCompile/editPoints';
export { createApolloEntity, inferLaneTurn } from './apolloCompile/factory';
export { compileApolloFeatures } from './apolloCompile/features';
