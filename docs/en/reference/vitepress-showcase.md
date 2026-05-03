---
title: VitePress Showcase
description: Default theme, navigation, sidebar, search, page history, and Markdown plugin examples used by the Apollo Map Studio docs site.
editLink: true
---

# VitePress Showcase <Badge type="tip" text="Theme" />

<!-- prettier-ignore -->
*[AMS]: Apollo Map Studio

This page is a visible regression target for the docs site. It exercises the default theme configuration and the Markdown extensions enabled for Apollo Map Studio.

## Default Theme

| Feature            | Current use                                                           |
| ------------------ | --------------------------------------------------------------------- |
| Navbar             | Guide, Architecture, API, More, and version flyouts                   |
| Locales            | Simplified Chinese at root and English under `/en/`                   |
| Sidebar            | Left-side groups for guide, architecture, API, reference, and recipes |
| Outline            | Right-side level two and three headings                               |
| Search             | Local search with detailed results, prefix search, and fuzzy matching |
| Doc footer         | Previous, next, last updated, and GitHub edit link                    |
| Page history       | Nolebase Git Changelog renders contributors and page history          |
| External link icon | Markdown external links show an icon                                  |
| 404 copy           | Custom notFound text for both locales                                 |

<GitHubRepoLink />

## Markdown Features

::: tip
The `tip` container uses the configured label and the default VitePress styling.
:::

::: warning
The `warning` container is useful for migration risks and operational caveats.
:::

::: details
The `details` container is a good fit for diagnostic commands or longer notes.
:::

> [!IMPORTANT]
> GitHub-flavored alerts are enabled, so migration notes can keep their GitHub style.

### Code Groups And Line Numbers

::: code-group

```ts [VitePress config]
export default {
  markdown: {
    lineNumbers: true,
    math: true,
  },
};
```

```bash [Verification]
pnpm docs:build
```

:::

### Task Lists

- [x] Navbar
- [x] Sidebar and right outline
- [x] Local search
- [x] Page history and contributors
- [x] Mermaid diagrams
- [x] Markdown plugins

### Footnotes, Abbreviations, Subscript, Superscript, Mark

Apollo Map Studio can use the AMS abbreviation, write units like m^2^, H~2~O, and ==highlight important details==. Footnotes keep secondary context out of the main flow.[^roundtrip]

[^roundtrip]: Round-trip IO means `.bin`, `.txt`, and `.pb.txt` imports and exports preserve as much Apollo field data as possible.

### Math

Inline math: $s = r \theta$.

Block math:

$$
d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}
$$

### Attributes

The paragraph below uses `markdown-it-attrs` for a class and data attribute.

Content that can be targeted by style hooks or tests.{.ams-docs-hook data-kind="vitepress-showcase"}
