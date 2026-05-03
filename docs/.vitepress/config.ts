import { defineConfig } from 'vitepress';
import type MarkdownIt from 'markdown-it';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { version } from '../../package.json';
import abbr from 'markdown-it-abbr';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import taskLists from 'markdown-it-task-lists';
import {
  enSidebarApi,
  enSidebarArchitecture,
  enSidebarContributing,
  enSidebarGuide,
  enSidebarRecipes,
  enSidebarReference,
  enSidebarSuperpowers,
  zhSidebarApi,
  zhSidebarArchitecture,
  zhSidebarContributing,
  zhSidebarGuide,
  zhSidebarRecipes,
  zhSidebarReference,
  zhSidebarSuperpowers,
} from './sidebars';

// VITEPRESS_BASE is injected by GitHub Actions for sub-path deployment
// e.g. /apollo-map-studio/ when hosted at github.io/<repo>/
const base = process.env.VITEPRESS_BASE ?? '/';

const REPO_URL = 'https://github.com/SakuraPuare/apollo-map-studio';
const REPO_EDIT_URL = `${REPO_URL}/edit/main/docs/:path`;

const SOCIAL = [
  { icon: 'github', link: REPO_URL, ariaLabel: 'GitHub' },
  { icon: 'npm', link: 'https://www.npmjs.com/package/vitepress', ariaLabel: 'VitePress' },
];

const DEFAULT_EDITOR: PageEditor = {
  name: 'SakuraPuare',
  email: 'java20131114@gmail.com',
  avatar: 'https://github.com/SakuraPuare.png?size=96',
  link: 'https://github.com/SakuraPuare',
};

const GITHUB_USERS_BY_EMAIL: Record<string, string> = {
  'java20131114@gmail.com': 'SakuraPuare',
};

type PageEditor = {
  name: string;
  email: string;
  avatar: string;
  link?: string;
};

const normalizeGitName = (name: string) => (name === 'Steven Moder' ? 'SakuraPuare' : name);

const editorAvatar = (email: string, githubUser?: string) => {
  if (githubUser) return `https://github.com/${githubUser}.png?size=96`;

  const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `https://github.com/identicons/${hash}.png`;
};

const pageEditorsFor = (filePath: string): PageEditor[] => {
  const fullPath = resolve(process.cwd(), 'docs', filePath);
  if (!filePath || !existsSync(fullPath)) return [DEFAULT_EDITOR];

  try {
    const output = execFileSync('git', ['log', '--follow', '--format=%an%x09%ae', '--', fullPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const editors = new Map<string, PageEditor>();
    for (const line of output.trim().split('\n')) {
      const [rawName, rawEmail] = line.split('\t');
      const email = rawEmail?.trim().toLowerCase();
      if (!rawName || !email || editors.has(email)) continue;

      const githubUser = GITHUB_USERS_BY_EMAIL[email];
      editors.set(email, {
        name: normalizeGitName(rawName.trim()),
        email,
        avatar: editorAvatar(email, githubUser),
        link: githubUser ? `https://github.com/${githubUser}` : undefined,
      });
    }

    return editors.size ? [...editors.values()] : [DEFAULT_EDITOR];
  } catch {
    return [DEFAULT_EDITOR];
  }
};

const configureMarkdownPlugins = (md: MarkdownIt) => {
  md.use(abbr)
    .use(footnote)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(taskLists, { enabled: false, label: true });
};

export default defineConfig({
  title: 'Apollo Map Studio',
  description: 'Apollo HD 高精地图编辑器 · Desktop & Web · 中英双语完整文档',
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  appearance: 'force-auto',
  scrollOffset: { selector: '#VPContent', padding: 24 },
  useWebFonts: false,

  head: [
    ['meta', { name: 'theme-color', content: '#0ea5e9' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Apollo Map Studio · HD 地图编辑器' }],
  ],

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    lineNumbers: true,
    codeCopyButtonTitle: '复制代码 / Copy code',
    defaultHighlightLang: 'txt',
    externalLinks: { target: '_blank', rel: 'noreferrer noopener' },
    image: { lazyLoading: true },
    math: true,
    attrs: {
      allowedAttributes: ['id', 'class', /^data-/],
    },
    headers: {
      level: [2, 3, 4],
    },
    toc: {
      level: [2, 3],
    },
    container: {
      tipLabel: '提示',
      infoLabel: '信息',
      warningLabel: '注意',
      dangerLabel: '危险',
      detailsLabel: '展开更多',
      importantLabel: '重要',
      cautionLabel: '谨慎',
    },
    config: configureMarkdownPlugins,
  },

  transformPageData(pageData) {
    return {
      contributors: pageEditorsFor(pageData.filePath),
    };
  },

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Apollo Map Studio',
      description: 'Apollo HD 地图编辑器 · 桌面与 Web · 完整中文文档',
      themeConfig: {
        logo: { src: '/logo.svg', alt: 'Apollo Map Studio' },
        logoLink: '/',
        siteTitle: 'Apollo Map Studio',
        nav: [
          { text: '指南', link: '/guide/getting-started', activeMatch: '^/guide/' },
          { text: '架构', link: '/architecture/overview', activeMatch: '^/architecture/' },
          { text: 'API', link: '/api/', activeMatch: '^/api/' },
          {
            text: '更多',
            activeMatch: '^/(reference|recipes|contributing|superpowers|changelog)',
            items: [
              { text: '参考', link: '/reference/' },
              { text: 'VitePress 功能展示', link: '/reference/vitepress-showcase' },
              { text: '操作手册', link: '/recipes/adding-a-new-action' },
              { text: '贡献', link: '/contributing/development-setup' },
              { text: '设计规格', link: '/superpowers/' },
              { text: '更新日志', link: '/changelog' },
            ],
          },
          {
            text: `v${version}`,
            items: [
              {
                text: '项目版本',
                items: [
                  { text: `当前 v${version}`, link: '/changelog' },
                  { text: 'GitHub Releases', link: `${REPO_URL}/releases` },
                ],
              },
              {
                text: '生态',
                items: [
                  {
                    text: 'VitePress 默认主题配置',
                    link: 'https://vitepress.dev/zh/reference/default-theme-config',
                  },
                  { text: 'VitePress Markdown', link: 'https://vitepress.dev/zh/guide/markdown' },
                ],
              },
            ],
          },
        ],
        sidebar: {
          '/guide/': zhSidebarGuide,
          '/architecture/': zhSidebarArchitecture,
          '/api/': zhSidebarApi,
          '/reference/': zhSidebarReference,
          '/recipes/': zhSidebarRecipes,
          '/contributing/': zhSidebarContributing,
          '/superpowers/': zhSidebarSuperpowers,
        },
        aside: 'left',
        outline: { label: '本页内容', level: [2, 3] },
        docFooter: { prev: '上一篇', next: '下一篇' },
        lastUpdated: {
          text: '最后更新于',
          formatOptions: {
            dateStyle: 'medium',
            timeStyle: 'short',
            forceLocale: true,
          },
        },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
        skipToContentLabel: '跳到正文',
        externalLinkIcon: true,
        editLink: {
          pattern: REPO_EDIT_URL,
          text: '在 GitHub 上编辑此页',
        },
        notFound: {
          title: '页面不存在',
          quote: '这条文档路径没有找到。可以回到首页，或使用站内搜索定位内容。',
          linkLabel: '返回首页',
          linkText: '返回 Apollo Map Studio',
        },
        footer: {
          message: '基于 CC BY-NC 4.0 协议发布',
          copyright: 'Copyright © 2024-present ShuYingJiYu',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'Apollo Map Studio',
      description: 'Desktop and web HD map editor for the Apollo autonomous driving platform',
      themeConfig: {
        logo: { src: '/logo.svg', alt: 'Apollo Map Studio' },
        logoLink: '/en/',
        siteTitle: 'Apollo Map Studio',
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started', activeMatch: '^/en/guide/' },
          {
            text: 'Architecture',
            link: '/en/architecture/overview',
            activeMatch: '^/en/architecture/',
          },
          { text: 'API', link: '/en/api/', activeMatch: '^/en/api/' },
          {
            text: 'More',
            activeMatch: '^/en/(reference|recipes|contributing|superpowers|changelog)',
            items: [
              { text: 'Reference', link: '/en/reference/' },
              { text: 'VitePress Showcase', link: '/en/reference/vitepress-showcase' },
              { text: 'Recipes', link: '/en/recipes/adding-a-new-action' },
              { text: 'Contributing', link: '/en/contributing/development-setup' },
              { text: 'Design Specs', link: '/en/superpowers/' },
              { text: 'Changelog', link: '/en/changelog' },
            ],
          },
          {
            text: `v${version}`,
            items: [
              {
                text: 'Project',
                items: [
                  { text: `Current v${version}`, link: '/en/changelog' },
                  { text: 'GitHub Releases', link: `${REPO_URL}/releases` },
                ],
              },
              {
                text: 'Ecosystem',
                items: [
                  {
                    text: 'VitePress Theme Config',
                    link: 'https://vitepress.dev/reference/default-theme-config',
                  },
                  { text: 'VitePress Markdown', link: 'https://vitepress.dev/guide/markdown' },
                ],
              },
            ],
          },
        ],
        sidebar: {
          '/en/guide/': enSidebarGuide,
          '/en/architecture/': enSidebarArchitecture,
          '/en/api/': enSidebarApi,
          '/en/reference/': enSidebarReference,
          '/en/recipes/': enSidebarRecipes,
          '/en/contributing/': enSidebarContributing,
          '/en/superpowers/': enSidebarSuperpowers,
        },
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous', next: 'Next' },
        lastUpdated: {
          text: 'Last updated',
          formatOptions: {
            dateStyle: 'medium',
            timeStyle: 'short',
            forceLocale: true,
          },
        },
        returnToTopLabel: 'Return to top',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        langMenuLabel: 'Change language',
        skipToContentLabel: 'Skip to content',
        externalLinkIcon: true,
        editLink: {
          pattern: REPO_EDIT_URL,
          text: 'Edit this page on GitHub',
        },
        notFound: {
          title: 'Page not found',
          quote:
            'This documentation path does not exist. Return home or use search to find the page.',
          linkLabel: 'go to home',
          linkText: 'Go to Apollo Map Studio',
        },
        footer: {
          message: 'Released under the CC BY-NC 4.0 License.',
          copyright: 'Copyright © 2024-present ShuYingJiYu',
        },
      },
    },
  },

  themeConfig: {
    socialLinks: SOCIAL,
    i18nRouting: true,
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        miniSearch: {
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 },
          },
        },
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '无相关结果',
                resetButtonTitle: '清除查询',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
          en: {
            translations: {
              button: { buttonText: 'Search docs', buttonAriaLabel: 'Search docs' },
              modal: {
                noResultsText: 'No results for',
                resetButtonTitle: 'Clear query',
                footer: {
                  selectText: 'to select',
                  navigateText: 'to navigate',
                  closeText: 'to close',
                },
              },
            },
          },
        },
      },
    },
  },
});
