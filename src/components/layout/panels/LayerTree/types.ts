import type { ParentTarget } from '@/lib/entityOps';

export type DropKind = 'junction' | 'road' | 'roadSection' | 'unparented' | 'none';

export interface TreeNode {
  id: string;
  name: string;
  kind: 'group' | 'section' | 'entity';
  entityType?: string;
  entityId?: string;
  parentTarget?: ParentTarget;
  dropKind: DropKind;
  children?: TreeNode[];
}
