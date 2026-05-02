---
title: SearchPanel
description: Sidebar 中的扁平搜索面板——按 entity id / entityType 子串扁平匹配，最多 200 项，点击即选中。
---

# SearchPanel

> 源码：`src/components/layout/panels/SearchPanel.tsx`

## 用途与 UX 角色

`SearchPanel` 是 ActivityBar `search` tab 选中时显示的内容。它做一件事：在所有 `mapStore.entities` 上做**扁平**子串搜索，并把命中结果做成可点击列表。和 LayerTree 不同，它**不保留层级**——目的是让用户在不知道实体在哪儿的情况下也能找到它。

UX 行为：

- 顶部输入框聚焦输入；查询字符串经 `useSidebar()` 与父组件共享，刷新面板不会丢失搜索状态。
- 搜索内容支持 entity id 子串（不区分大小写）和 entityType（`lane` / `crosswalk` / …）。
- 命中数量上限 200——避免大地图下渲染上万条 DOM。
- 当前选中实体高亮 `bg-cyan-500/15`。

## 组件组合树

```mermaid
flowchart TB
  SP[SearchPanel]
  SP --> Header[输入框 + 命中计数]
  SP --> List[结果列表 \(<= 200\)]
  List --> Row[Row \(id, entityType\)]
```

## Props 接口

```ts
interface SearchPanelProps {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}
```

| Prop         | 类型                           | 默认值      | 说明                                                                         |
| ------------ | ------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| `selectedId` | `string \| null`               | `undefined` | 高亮当前选中行                                                               |
| `onSelect`   | `(id: string \| null) => void` | `undefined` | 行点击回调；通常调 `actorRef.send({ type: 'SELECT_ENTITY', id })` 的同源链路 |

## 内部状态

| 钩子                      | 用途                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `useMapStore(s.entities)` | 订阅实体 Map                                                  |
| `useSidebar()`            | `searchQuery` / `setSearchQuery` —— 与 Sidebar 共享查询字符串 |
| `useMemo(() => results)`  | 基于 `entities` + `searchQuery` 派生命中数组                  |

派生逻辑（`SearchPanel.tsx:20-31`）：

```ts
const q = searchQuery.trim().toLowerCase();
if (!q) return [];
const out: { id: string; entityType: string }[] = [];
for (const e of entities.values()) {
  if (e.id.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q)) {
    out.push({ id: e.id, entityType: e.entityType });
    if (out.length >= 200) break;
  }
}
return out;
```

200 项上限是显式 `break`，不依赖 React 渲染层裁剪。

## 副作用

无 effect。`autoFocus` 由 `<input autoFocus />` 自身实现——挂载时浏览器自动聚焦。

## 渲染骨架

```jsx
<div className="h-full flex flex-col">
  <div className="px-2 py-2 border-b border-white/[0.07] shrink-0">
    <div className="relative">
      <FaMagnifyingGlass className="absolute …" />
      <input type="search" value={searchQuery} onChange={…} placeholder="Search id or type…" autoFocus />
    </div>
    <div className="text-[10px] text-zinc-600 mt-1 px-1">
      {searchQuery ? `${results.length} match${…}` : 'Type to search'}
    </div>
  </div>
  <div className="flex-1 overflow-y-auto">
    {/* ul of li rows */}
  </div>
</div>
```

每个结果 row：

```jsx
<li onClick={() => onSelect?.(r.id)} className={…}>
  <span className="text-xs font-mono text-zinc-300 truncate" title={r.id}>
    {r.id.length > 22 ? `…${r.id.slice(-18)}` : r.id}
  </span>
  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
    {r.entityType}
  </span>
</li>
```

## 性能注释

- **O(N) 线性扫描**：每次查询在所有实体上做子串匹配。N=1e4 时 ~1ms，无需索引。
- **早停 200**：避免极端长查询字符串生成不必要 DOM。
- **`useMemo` 双依赖**：`entities`（变化时刷新）与 `searchQuery`（每次输入刷新）。React-fast-refresh 不会破坏此 memo 行为。
- **不做高亮**：当前不高亮匹配子串；如需提高结果可读性，可在后续版本补充匹配片段高亮。

## 已知缺口

- 不支持按 entityType 过滤（如 `type:lane`）；
- 不支持模糊搜索 / 编辑距离；
- 200 上限对 1e5+ 实体地图不友好——需要 worker 索引或 chunked 渲染。

## 源码索引

| 关注点           | 文件位置                         |
| ---------------- | -------------------------------- |
| 组件主体         | `SearchPanel.tsx:16-82`          |
| 派生 results     | `SearchPanel.tsx:20-31`          |
| 输入框 + 命中数  | `SearchPanel.tsx:35-52`          |
| 结果列表         | `SearchPanel.tsx:53-79`          |
| `SidebarContext` | `src/context/SidebarContext.tsx` |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) → SidebarPanel → SearchPanel（`activeTab='search'`）
- [LayerTree](./layer-tree.md) — 互补的层级视图
- [`mapStore`](/api/store/store-map)
- `useSidebar` → `src/context/SidebarContext.tsx`

## 英文镜像

[/en/api/components/search-panel](/en/api/components/search-panel)
