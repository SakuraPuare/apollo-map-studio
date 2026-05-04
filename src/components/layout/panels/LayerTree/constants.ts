export { getEntityIcon, getEntityPluralLabel, TOP_LEVEL_ENTITY_TYPES } from '@/core/entityRegistry';

export function entityDisplayId(id: string): string {
  return id.length > 16 ? `…${id.slice(-12)}` : id;
}
