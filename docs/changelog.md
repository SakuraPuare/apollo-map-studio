---
title: Changelog
---

# Changelog

本文档当前作为 Apollo Map Studio 文档重构摘要使用，不虚构历史版本号，也不替代 Git 提交历史。

## 当前文档重构摘要

本次整理聚焦 store、UI、action、license 和授权运维链路：

- 重写 `docs/api/store-map.md`：更新为当前 `Map<string, MapEntity>` 单实体表模型，移除旧版 `lanes / junctions / roads` 分片 API 描述。
- 补充 `mapStore` 写操作细节：`addEntity`、`updateEntity`、`removeEntity`、`reparentEntity`、批量导入、导入替换和异步 overlap 重算。
- 明确 undo/redo 合同：zundo 只 partialize `{ entities }`，导入替换会暂停并清空历史，Action Dispatcher 必须先 `CANCEL` FSM 再执行 temporal undo/redo。
- 补充选择和编辑链路：选择状态在编辑 FSM，Inspector 通过实体 ID 读取 `mapStore.entities`，表单写完整实体并触发拓扑和 overlap reconcile。
- 补充拓扑和 overlap 风险点：lane/junction 触发车道拓扑，增量 overlap 依赖 dirty 集，worker full reconcile 基于快照。
- 重写 `docs/api/store-ui.md`：覆盖当前 `uiStore`、`settingsStore`、Action Registry、Action Dispatcher、Command Palette、Sidebar 面板、Inspector 和 License renderer UI。
- 明确 UI store 不参与 undo/redo，选择状态不在 UI store，Settings 和 License 分别由独立 store 管理。
- 补充 Action Registry 合同：ActionId、ActionDef 字段、菜单/命令面板/快捷键 helper、平台化 shortcut 显示、输入控件中的 global shortcut 规则。
- 补充授权拦截语义：edit/tool/selection 类 action 和 store 写操作通过 `assertEditable()` 进入只读保护。
- 重写 `tools/license-gen/README.md`：补充离线授权签发、主进程校验、机器码、时间防篡改、三文件镜像存储、CLI 脚本、轮换、故障排查和安全边界。

## 当前已知风险点

- `settingsStore.historyLimit` 修改后，已创建的 zundo temporal store 不会自动重建；需要 reload 或重启才能完全应用。
- `replaceImportedEntityMap` 会清空 undo history，导入被视为新文档快照，不是普通编辑动作。
- `recomputeOverlapsAsync()` 使用调用时的实体快照；worker 计算期间若继续编辑，patch apply 后可能短暂 drift。
- renderer 侧授权状态用于 UI 展示和交互入口，真正校验在 Electron 主进程。
- `tools/license-gen/gen-keys.mjs --rotate` 会改写 `electron/license/public-key.cts`，并使旧 activation code 对新构建失效；必须作为发布事件处理。
