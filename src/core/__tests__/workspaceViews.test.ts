import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import {
  getDefaultSidebarViewId,
  getSidebarViewDef,
  getSidebarViewsByPlacement,
  getWorkspacePanelDefs,
  getWorkspacePanelDef,
  getWorkspaceViewByActionId,
  getWorkspaceViewDefs,
  isSidebarViewAvailable,
  isWorkspacePanelAvailable,
  isWorkspacePanelId,
  isWorkspaceViewActionId,
  registerSidebarView,
  registerWorkspacePanel,
  registerWorkspacePanelView,
} from '@/core/workspaceViews';

registerBuiltinWorkspaceContributions();

describe('workspace view contributions', () => {
  it('registers unique workspace view actions', () => {
    const actionIds = getWorkspaceViewDefs().map((view) => view.actionId);
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });

  it('references existing panels and sidebar views', () => {
    for (const view of getWorkspaceViewDefs()) {
      expect(isWorkspacePanelId(view.panelId), `${view.id} panel missing`).toBe(true);
      expect(() => getWorkspacePanelDef(view.panelId)).not.toThrow();
      if (view.kind === 'sidebar') {
        const sidebarIds = new Set(
          [...getSidebarViewsByPlacement('top'), ...getSidebarViewsByPlacement('bottom')].map(
            (sidebar) => sidebar.id,
          ),
        );
        expect(sidebarIds.has(view.sidebarViewId), `${view.id} sidebar view missing`).toBe(true);
      }
    }
  });

  it('keeps workspace view availability aligned with referenced panels and sidebar views', () => {
    for (const mode of ['drawing', 'scene'] as const) {
      for (const view of getWorkspaceViewDefs()) {
        const actionAvailable = Boolean(getWorkspaceViewByActionId(view.actionId, mode));
        const expectedAvailable =
          view.kind === 'sidebar'
            ? isWorkspacePanelAvailable(view.panelId, mode) &&
              isSidebarViewAvailable(view.sidebarViewId, mode)
            : isWorkspacePanelAvailable(view.panelId, mode);

        expect(actionAvailable, `${view.id} availability mismatch in ${mode}`).toBe(
          expectedAvailable,
        );
      }
    }
  });

  it('resolves timeline only in scene mode', () => {
    expect(getWorkspaceViewByActionId('view:timeline', 'drawing')).toBeUndefined();
    expect(getWorkspaceViewByActionId('view:timeline', 'scene')?.id).toBe('timelinePanel');
  });

  it('validates workspace action ids and unknown panel lookups', () => {
    expect(isWorkspaceViewActionId('view:timeline')).toBe(true);
    expect(isWorkspaceViewActionId('timeline')).toBe(false);
    expect(isWorkspaceViewActionId('view:missing')).toBe(false);
    expect(() => getWorkspacePanelDef('missing-panel')).toThrow(
      'Unknown workspace panel: missing-panel',
    );
  });

  it('contributes sidebar activity views by mode', () => {
    const drawingIds = getSidebarViewsByPlacement('top', 'drawing').map((view) => view.id);
    const sceneIds = getSidebarViewsByPlacement('top', 'scene').map((view) => view.id);
    expect(drawingIds).toEqual(['outline', 'layers', 'search']);
    expect(sceneIds).toEqual(['scenarios', 'outline', 'layers', 'search']);
  });

  it('resolves sidebar defaults, explicit defs, and unavailable ids', () => {
    expect(getDefaultSidebarViewId('drawing')).toBe('outline');
    expect(getDefaultSidebarViewId('scene')).toBe('scenarios');
    expect(getSidebarViewDef('outline')?.label).toBe('Outline');
    expect(getSidebarViewDef('missing')).toBeUndefined();
    expect(isSidebarViewAvailable('outline', 'drawing')).toBe(true);
    expect(isSidebarViewAvailable('scenarios', 'drawing')).toBe(false);
    expect(isSidebarViewAvailable('missing', 'scene')).toBe(false);
  });

  it('contributes dock panels by mode', () => {
    const drawingIds = getWorkspacePanelDefs('drawing').map((panel) => panel.id);
    const sceneIds = getWorkspacePanelDefs('scene').map((panel) => panel.id);
    expect(drawingIds).toEqual(['map', 'sidebar', 'inspector', 'toolbox']);
    expect(sceneIds).toEqual(['map', 'sidebar', 'inspector', 'toolbox', 'timeline']);
    expect(isWorkspacePanelAvailable('timeline', 'drawing')).toBe(false);
    expect(isWorkspacePanelAvailable('timeline', 'scene')).toBe(true);
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
      'toolbox',
      'scenarios',
    ]);
  });

  it('rejects duplicate panel, sidebar, and workspace action registrations', () => {
    const icon = getSidebarViewDef('outline')!.icon;

    expect(() =>
      registerWorkspacePanel({
        id: 'map',
        component: 'map',
        defaultTitle: 'Duplicate Map',
        zone: 'editor',
        order: 999,
      }),
    ).toThrow('Duplicate workspace panel: map');

    expect(() =>
      registerSidebarView({
        id: 'outline',
        label: 'Duplicate Outline',
        icon,
        placement: 'top',
        order: 999,
        kind: 'panel',
      }),
    ).toThrow('Duplicate sidebar view: outline');

    expect(() =>
      registerWorkspacePanelView({
        id: 'duplicateLayersPanel',
        actionId: 'view:layers',
        label: 'Duplicate Layers',
        icon,
        menuOrder: 999,
        panelId: 'map',
      }),
    ).toThrow('Duplicate workspace view action: view:layers');

    expect(() =>
      registerSidebarView({
        id: 'duplicateLayersSidebar',
        label: 'Duplicate Layers',
        icon,
        placement: 'top',
        order: 999,
        kind: 'panel',
        action: { actionId: 'view:layers', menuOrder: 999 },
      }),
    ).toThrow('Duplicate workspace view action: view:layers');
  });

  it('rejects workspace panel views that reference unknown panels', () => {
    const icon = getSidebarViewDef('outline')!.icon;

    expect(() =>
      registerWorkspacePanelView({
        id: 'missingPanelView',
        actionId: 'view:missingPanelView',
        label: 'Missing Panel',
        icon,
        menuOrder: 999,
        panelId: 'missing-panel',
      }),
    ).toThrow('Unknown workspace panel: missing-panel');
  });

  it('renders lazy sidebar panel fallbacks for built-in panel views', () => {
    const cases = [
      ['outline', 'Loading outline...'],
      ['layers', 'Loading layers...'],
      ['search', 'Loading search...'],
      ['scenarios', 'Loading scenarios...'],
    ] as const;

    for (const [viewId, fallback] of cases) {
      const view = getSidebarViewDef(viewId);
      expect(view?.render).toBeDefined();

      const html = renderToStaticMarkup(
        React.createElement(
          React.Fragment,
          null,
          view!.render!({ onSelect: () => {}, selectedId: null }),
        ),
      );

      expect(html).toContain(fallback);
    }
  });
});
