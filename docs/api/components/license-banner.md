---
title: LicenseBanner
description: 顶部许可状态条——根据 licenseStore 的 status / daysRemaining / hoursRemaining，按场景不同色调展示并暴露激活按钮。
---

# LicenseBanner

> 源码：`src/components/license/LicenseBanner.tsx`

## 用途与 UX 角色

`LicenseBanner` 是 MenuBar 下方、ToolStrip 上方的薄横幅。它根据 `useLicenseStore` 的 `state.status` 决定**是否**显示和**如何**显示：

- `activated` 且永久（`expires === 0`）→ 不显示
- `activated` 且 ≤14 天到期 → cyan/绿色"Manage license"提示
- `activated` 且 >14 天到期 → 不显示
- `trial` 且 >3 天剩余 → 不显示
- `trial` 且 ≤3 天 → cyan 提示，剩 24h 内显示"Trial ends in Nh"
- `expired_trial` / `expired_license` → amber 警告 + Activate 按钮
- `tampered` / `machine_mismatch` / `invalid` → rose 阻断 + 强提示
- `not_started` → 灰色 pending 提示

按钮文案根据状态不同：`Manage license`（已激活但快到期）/ `Activate`（其他需操作场景）。点击调用 `licenseStore.promptActivation()`，最终触发 [ActivationDialog](./activation-dialog.md)。

## 组件接口

`LicenseBanner` 不接受 props——状态全部来自 `useLicenseStore`：

```ts
export function LicenseBanner(): JSX.Element | null;
```

## STATUS_TONE 字典

```ts
const STATUS_TONE: Record<string, { bg, border, text, icon }> = {
  activated: { … emerald …, icon: FaShield },
  trial: { … cyan …, icon: FaClock },
  expired_trial: { … amber …, icon: FaTriangleExclamation },
  expired_license: { … amber …, icon: FaTriangleExclamation },
  tampered: { … rose …, icon: FaTriangleExclamation },
  machine_mismatch: { … rose …, icon: FaTriangleExclamation },
  invalid: { … rose …, icon: FaTriangleExclamation },
  not_started: { … zinc …, icon: FaClock },
};
```

未列出的 status fallback 到 `trial` 配色。

## 内部状态

| 钩子                                  | 用途                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `useLicenseStore(s.state)`            | 整个许可状态对象（status + license + daysRemaining + …） |
| `useLicenseStore(s.promptActivation)` | 触发 ActivationDialog                                    |

无 `useEffect`。

## 副作用

无 effect。点击按钮触发 `promptActivation`——这是 ActivationDialog 在 mount 时通过 `registerPromptActivation` 注册的全局 callback。

## 显隐逻辑

```ts
if (state.status === 'activated' && state.license?.expires === 0) return null;
if (state.status === 'trial' && state.daysRemaining !== null && state.daysRemaining > 3)
  return null;
if (state.status === 'activated') {
  if (state.daysRemaining === null || state.daysRemaining > 14) return null;
}
```

按钮显示条件（`LicenseBanner.tsx:114-118`）：

```ts
!state.canEdit ||
  state.status === 'trial' ||
  (state.status === 'activated' && state.daysRemaining !== null && state.daysRemaining <= 14);
```

## 消息派生

```ts
switch (state.status) {
  case 'trial':
    return state.hoursRemaining <= 24
      ? `Trial ends in ${state.hoursRemaining}h — activate to keep editing`
      : `Trial: ${state.daysRemaining}d remaining`;
  case 'activated':
    return state.daysRemaining
      ? `Licensed · ${state.daysRemaining}d remaining`
      : 'Licensed · perpetual';
  // …其他 status 各有定制文案
  default:
    return state.reason; // licenseStore 给的低层原因
}
```

## 渲染骨架

```jsx
<div
  className={`flex items-center justify-between px-4 py-1.5 border-b ${tone.bg} ${tone.border} ${tone.text}`}
>
  <div className="flex items-center gap-2 text-xs">
    <Icon className="w-3.5 h-3.5" />
    <span>{message}</span>
  </div>
  {showButton && (
    <button onClick={() => promptActivation()} className="…">
      <FaKey /> {state.status === 'activated' ? 'Manage license' : 'Activate'}
    </button>
  )}
</div>
```

## 性能注释

- 不订阅高频字段（如 `entities`），只订阅 `state` 和 `promptActivation`——典型一天变化几次。
- 大多数情况下返回 `null`，不渲染任何 DOM——空闲时几乎零成本。

## 已知缺口

- 不显示具体到期时间（仅 days/hours），用户必须打开 ActivationDialog 才看到精确时间戳。
- 离线 / 无网络时 LicenseBanner 不区分——`tampered` 与 `machine_mismatch` 都显示 rose 阻断，可能让正在网络抖动场景的用户误以为被锁。

## 源码索引

| 关注点             | 文件位置                    |
| ------------------ | --------------------------- |
| 主组件             | `LicenseBanner.tsx:63-130`  |
| `STATUS_TONE` 字典 | `LicenseBanner.tsx:5-56`    |
| 显隐 early-return  | `LicenseBanner.tsx:67-74`   |
| 消息派生           | `LicenseBanner.tsx:79-105`  |
| 按钮显示条件       | `LicenseBanner.tsx:114-118` |
| `licenseStore`     | `src/store/licenseStore.ts` |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — 父组件
- [ActivationDialog](./activation-dialog.md) — 实际的激活流程
- [`licenseStore`](/api/store/) — 状态机
- `useLicenseSync` → `src/hooks/useLicense.ts`

## 英文镜像

[/en/api/components/license-banner](/en/api/components/license-banner)
