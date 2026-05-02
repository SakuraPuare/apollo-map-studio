---
title: ActivationDialog
description: 激活弹窗——展示机器码 + 接受激活码（Ed25519 签名 token），通过 licenseBridge 在 Electron 主进程做验证、回收/绑定校验并落地状态。
---

# ActivationDialog

> 源码：`src/components/license/ActivationDialog.tsx`

## 用途与 UX 角色

`ActivationDialog` 是离线激活流程的 UI 端：

1. **显示机器码**：从 `licenseStore.state.machineCode` 读取，单选 + Copy 按钮（带 1.5s "Copied" 反馈）。
2. **粘贴激活码**：textarea 接受 `APMS1.eyJ…` 格式的 Ed25519 签名 token。
3. **提交激活**：调用 `licenseBridge.activate(trimmed)` → IPC → 主进程做：
   - Ed25519 公钥验签
   - replay 检测（machine 绑定、过期）
   - 落地 `~/.config/apollo-map-studio/license.bin`
   - 回写新的 `state` 给 renderer
4. **错误回显**：rose 提示框显示主进程返回的 `errorMessage`。
5. **已激活状态展示**：成功后显示 emerald `Activated · {license.name}` + 过期时间。
6. **tampered 状态特殊提示**：底部 amber 提示用户检查系统时钟。

它**自注册全局触发器**——在 mount 时调 `registerPromptActivation(...)`，使得任何地方调 `licenseStore.promptActivation()` 都能打开此 dialog（例如 LicenseBanner 按钮、过期 modal、main 进程心跳）。

## 组件接口

`ActivationDialog` 不接受 props：

```ts
export function ActivationDialog(): JSX.Element | null;
```

未打开时返回 `null`——关闭即从 DOM 移除。

## 内部状态

| `useState` / `useRef` | 类型/初值         | 用途                                 |
| --------------------- | ----------------- | ------------------------------------ |
| `open`                | `false`           | 控制可见性                           |
| `code`                | `''`              | 用户输入的激活码                     |
| `busy`                | `false`           | activate 进行中——禁用 close + button |
| `copied`              | `false`           | 复制反馈（1.5s 自动恢复）            |
| `error`               | `null \| string`  | 提交错误回显                         |
| `textareaRef`         | `React.RefObject` | open 时聚焦                          |

| `useLicenseStore` 字段     | 用途                       |
| -------------------------- | -------------------------- |
| `state`                    | 当前许可状态               |
| `setState`                 | 主进程返回新状态时回写     |
| `registerPromptActivation` | 注册"打开 dialog" callback |

## 副作用

| 时机                                    | 行为                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `useEffect([registerPromptActivation])` | 注册 `() => { setOpen(true); setError(null); }` 作为全局触发器                           |
| `useEffect([open, handleClose])` Esc    | open 时挂 `keydown` 监听，Esc → `handleClose`                                            |
| `useEffect([open])` 聚焦                | open 时 `setTimeout(() => textareaRef.current?.focus(), 50)`（让 dialog 动画完成再聚焦） |
| `handleCopy`                            | `navigator.clipboard.writeText(state.machineCode)`，失败 silent fallback                 |
| `handleActivate`                        | `licenseBridge.activate(code)` → 处理 `result.ok` / `result.errorMessage`                |
| `handleClose`                           | `busy=true` 时拒绝关闭；否则 close + 清空 code/error                                     |

## 渲染骨架

```jsx
<div className="fixed inset-0 z-[100] flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
  <div className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <Header title="Apollo Map Studio License" hint={`status: ${status} · ${reason}`} onClose={handleClose} disabled={busy} />
    <div className="px-5 py-4 space-y-5">
      <Section title="This machine's code">
        <code className="…">{state.machineCode}</code>
        <button onClick={handleCopy}>Copy / Copied</button>
      </Section>
      {isActivated && license && (
        <Section emerald>
          <p>Activated · {license.name}</p>
          <p>id: {license.id} · expires: {license.expires === 0 ? 'never' : new Date(license.expires).toLocaleString()}</p>
        </Section>
      )}
      <Section title="Paste activation code">
        <textarea ref={textareaRef} … />
        {error && <ErrorBox icon={FaCircleExclamation}>{error}</ErrorBox>}
      </Section>
      {state.status === 'tampered' && <p className="text-amber">…re-activation required after correcting system clock…</p>}
    </div>
    <Footer onClose={handleClose} onActivate={handleActivate} busy={busy} disabled={code.trim().length === 0} />
  </div>
</div>
```

z-[100] 与 [TaskProgressOverlay](./task-progress-overlay.md) 同层——但 ActivationDialog 是**用户主动触发**，TaskProgress 是阻塞性进度条，两者不会并存。

## 性能注释

- **always-mounted at root**：`WorkspaceLayout.tsx:179` 总是渲染 `<ActivationDialog />`，但 `open=false` 时返回 null。**这是必须的**——否则 `registerPromptActivation` 的 effect 不会运行，全局触发器永远不可用。
- 输入 textarea 不做实时校验；提交后由主进程返回 `errorMessage` 才显示——避免给用户反馈"格式不对"的 false positive。

## 安全注释

- 客户端**不做** Ed25519 验签——所有验签都在主进程（参考 v1 commit 142ece9 "feat(license): add offline activation system with machine binding"）。客户端拿到的 `code` 只做 `trim().replace(/\s+/g, '')` 清理。
- `state.machineCode` 由主进程在启动时计算并暴露——不会因为 renderer 篡改而改变。

## 已知缺口

- 没有"重新申请"流程——用户必须重新走"复制机器码 → 联系供应商 → 拿新 token"路径。
- 没有过期续期续费 UI——目前 expired_license 和 trial expired 走同一激活流程。
- 没有多语言——所有提示都是英文。

## 源码索引

| 关注点               | 文件位置                       |
| -------------------- | ------------------------------ |
| 主组件               | `ActivationDialog.tsx:15-214`  |
| 全局触发器注册       | `ActivationDialog.tsx:35-40`   |
| Esc 监听             | `ActivationDialog.tsx:43-53`   |
| 自动聚焦             | `ActivationDialog.tsx:56-62`   |
| `handleCopy`         | `ActivationDialog.tsx:64-72`   |
| `handleActivate`     | `ActivationDialog.tsx:74-96`   |
| Activated state 显示 | `ActivationDialog.tsx:148-158` |
| Tampered 提示        | `ActivationDialog.tsx:184-190` |
| `licenseBridge`      | `src/lib/license-bridge.ts`    |
| 主进程激活实现       | `electron/main/license/*`      |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — `<ActivationDialog />` 始终挂载于根
- [LicenseBanner](./license-banner.md) — 弹出该 dialog 的常规入口
- [`licenseStore`](/api/store) — 状态机
- License IPC 协议 → [`/api/electron`](/api/electron)

## 英文镜像

[/en/api/components/activation-dialog](/en/api/components/activation-dialog)
