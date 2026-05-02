# ActivityBar

> Source: `src/components/layout/ActivityBar.tsx`

## Overview

`ActivityBar` is the 48px-wide vertical icon strip on the left edge of
the workspace. It mirrors VS Code's "activity bar" idiom — five icons
that switch the sidebar's content (Outline / Layers / Search /
Timeline / Settings). `Settings` is special: clicking it opens the
modal Settings panel and snaps the sidebar back to the previous tab.

## Component props

```ts
export type ActivityTab = 'explorer' | 'layers' | 'search' | 'timeline' | 'settings';

interface ActivityBarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}
```

| Prop          | Description                               |
| ------------- | ----------------------------------------- |
| `activeTab`   | Current tab (driven by `SidebarContext`)  |
| `onTabChange` | Setter from `SidebarContext.setActiveTab` |

## Behavior

### Tab list

```ts
const tabs = [
  { id: 'explorer', icon: FaFolderTree, label: 'Explorer' },
  { id: 'layers', icon: FaLayerGroup, label: 'Layers' },
  { id: 'search', icon: FaMagnifyingGlass, label: 'Search' },
  { id: 'timeline', icon: FaClock, label: 'Timeline' },
  { id: 'settings', icon: FaGear, label: 'Settings' }, // bottom
];
```

The first four render at the top, `settings` renders at the bottom
with a flex spacer between, matching VS Code layout muscle memory.

### Active indicator

Each active button shows a 2px cyan accent bar on its left edge:

```tsx
{
  activeTab === id && (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-ams-accent rounded-r" />
  );
}
```

### Settings tab is a modal trigger

`SidebarPanelContent` watches for `activeTab === 'settings'` and:

1. Calls the `onOpenSettings()` callback (which opens
   `SettingsPanel`).
2. Resets `activeTab` back to `'explorer'`.

This is done in an effect so the state update doesn't fire during
render. From the user's perspective, "click Settings → modal opens →
sidebar still shows Outline".

### Design tokens

`ActivityBar` is one of the reference components for the `ams-*`
token migration:

- `bg-ams-bg-base` for the strip background
- `border-ams-border-subtle` for the right-edge separator
- `text-ams-text-primary` / `text-ams-text-muted` for icons
- `bg-ams-surface-active` / `hover:bg-ams-surface-hover` for buttons
- `bg-ams-accent` for the active indicator

See [Design tokens](/architecture/design-tokens) for the full
catalogue.

## Examples

### Mounting

```tsx
const { activeTab, setActiveTab } = useSidebar();
return <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />;
```

### Adding a tab

1. Add a new entry to the `tabs` array.
2. Extend `ActivityTab` union type.
3. Wire the corresponding panel in `SidebarPanelContent`.

The icon comes from `react-icons/fa6` — pick whatever fits the new
panel's identity.

## Related

- [Workspace layout](/api/components/workspace-layout)
- [SidebarPanel](/api/components/map-outline)
- [Settings panel](/api/components/settings-panel)
- [Design tokens](/architecture/design-tokens)
