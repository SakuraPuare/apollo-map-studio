---
title: VitePress 功能展示
description: Apollo Map Studio 文档站启用的默认主题、导航、侧边栏、搜索、页脚、编辑者头像与 Markdown 插件示例。
editLink: true
---

# VitePress 功能展示 <Badge type="tip" text="主题" />

<!-- prettier-ignore -->
*[AMS]: Apollo Map Studio

这一页用于集中验证文档站的默认主题能力和 Markdown 扩展。它也是新增 VitePress 配置时的人工回归页。

## 默认主题

| 功能       | 当前用法                                      |
| ---------- | --------------------------------------------- |
| 顶部导航   | 指南、架构、API、更多、版本下拉               |
| 多语言     | 简体中文根路径 + `/en/` 英文路径              |
| 侧边栏     | 按指南、架构、API、参考、操作手册、贡献分组   |
| 大纲       | 左侧显示二、三级标题                          |
| 搜索       | 本地搜索，启用详细结果、prefix 和 fuzzy       |
| 文档页脚   | 上一篇、下一篇、最后更新时间、GitHub 编辑链接 |
| 外链图标   | Markdown 外链自动带图标                       |
| 编辑者头像 | 每页从 `git log` 提取提交者并显示头像         |
| 404 文案   | 中英文自定义 notFound 文案                    |

<GitHubRepoLink />

## Markdown 内置能力

::: tip
`tip` 容器使用中文标题，并继承 VitePress 默认样式。
:::

::: warning
`warning` 容器用于强调风险或迁移注意事项。
:::

::: details
`details` 容器适合放折叠的诊断命令或长说明。
:::

> [!IMPORTANT]
> GitHub Flavored Alerts 已启用，可以在迁移说明中保持 GitHub 风格。

### 代码组与行号

::: code-group

```ts [VitePress 配置]
export default {
  markdown: {
    lineNumbers: true,
    math: true,
  },
};
```

```bash [验证命令]
pnpm docs:build
```

:::

### 任务列表

- [x] 导航栏
- [x] 侧边栏
- [x] 本地搜索
- [x] 每页编辑者头像
- [x] Markdown 插件

### 脚注、缩写、上下标与高亮

Apollo Map Studio 可以写 AMS 缩写，也可以记录坐标单位如 m^2^、H~2~O 或 ==重点标记==。脚注适合放不会打断正文的补充说明。[^roundtrip]

[^roundtrip]: 往返 IO 指 `.bin`、`.txt`、`.pb.txt` 在导入和导出之间尽量保持 Apollo 字段信息。

### 数学公式

行内公式：$s = r \theta$。

块级公式：

$$
d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}
$$

### 属性与锚点

下面的段落使用 `markdown-it-attrs` 写入类名和数据属性。

可被样式或测试定位的内容。{.ams-docs-hook data-kind="vitepress-showcase"}
