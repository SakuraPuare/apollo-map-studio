import { describe, expect, it } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import {
  getSidebarViewsByPlacement,
  getWorkspacePanelDef,
  getWorkspaceViewByActionId,
  getWorkspaceViewDefs,
  isWorkspacePanelId,
} from '@/core/workspaceViews';

registerBuiltinWorkspaceContributions();

describe('workspace view contributions', () => {
  it('registers unique workspace view actions', () => {
    const actionIds = getWorkspaceViewDefs().map((view) => view.actionId);
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });

  it('references existing panels and sidebar views', () => {
    const sidebarIds = new Set(
      [...getSidebarViewsByPlacement('top'), ...getSidebarViewsByPlacement('bottom')].map(
        (view) => view.id,
      ),
    );

    for (const view of getWorkspaceViewDefs()) {
      expect(isWorkspacePanelId(view.panelId), `${view.id} panel missing`).toBe(true);
      expect(() => getWorkspacePanelDef(view.panelId)).not.toThrow();
      if (view.sidebarViewId) {
        expect(sidebarIds.has(view.sidebarViewId), `${view.id} sidebar view missing`).toBe(true);
      }
    }
  });

  it('resolves timeline only in scene mode', () => {
    expect(getWorkspaceViewByActionId('view:timeline', 'drawing')).toBeUndefined();
    expect(getWorkspaceViewByActionId('view:timeline', 'scene')?.id).toBe('timelinePanel');
  });

  it('contributes sidebar activity views by mode', () => {
    const drawingIds = getSidebarViewsByPlacement('top', 'drawing').map((view) => view.id);
    const sceneIds = getSidebarViewsByPlacement('top', 'scene').map((view) => view.id);
    expect(drawingIds).toEqual(['outline', 'layers', 'search']);
    expect(sceneIds).toEqual(['outline', 'layers', 'search', 'timeline']);
  });

  it('can bootstrap built-in contributions repeatedly', () => {
    expect(() => registerBuiltinWorkspaceContributions()).not.toThrow();
    expect(() => registerBuiltinWorkspaceContributions()).not.toThrow();
    expect(getWorkspaceViewDefs().map((view) => view.id)).toEqual([
      'mapEditor',
      'outline',
      'layers',
      'search',
      'inspector',
      'timelinePanel',
    ]);
  });
});
