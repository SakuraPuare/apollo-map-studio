import { defineConfig } from 'vitepress';
import { version } from '../../package.json';
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

const SOCIAL = [{ icon: 'github', link: 'https://github.com/SakuraPuare/apollo-map-studio' }];

export default defineConfig({
  title: 'Apollo Map Studio',
  description: 'Apollo HD 高精地图编辑器 · Desktop & Web · 中英双语完整文档',
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  head: [
    ['meta', { name: 'theme-color', content: '#0ea5e9' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Apollo Map Studio · HD 地图编辑器' }],
  ],

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Apollo Map Studio',
      description: 'Apollo HD 地图编辑器 · 桌面与 Web · 完整中文文档',
      themeConfig: {
        nav: [
          { text: '指南', link: '/guide/getting-started' },
          { text: '架构', link: '/architecture/overview' },
          { text: 'API', link: '/api/' },
          {
            text: '更多',
            items: [
              { text: '参考', link: '/reference/' },
              { text: '操作手册', link: '/recipes/adding-a-new-action' },
              { text: '贡献', link: '/contributing/development-setup' },
              { text: '设计规格', link: '/superpowers/' },
              { text: '更新日志', link: '/changelog' },
            ],
          },
          {
            text: `v${version}`,
            items: [{ text: 'Changelog', link: '/changelog' }],
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
        outline: { label: '本页内容', level: [2, 3] },
        docFooter: { prev: '上一篇', next: '下一篇' },
        lastUpdatedText: '最后更新于',
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        editLink: {
          pattern: 'https://github.com/SakuraPuare/apollo-map-studio/edit/main/docs/:path',
          text: '在 GitHub 上编辑此页',
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
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'Architecture', link: '/en/architecture/overview' },
          { text: 'API', link: '/en/api/' },
          {
            text: 'More',
            items: [
              { text: 'Reference', link: '/en/reference/' },
              { text: 'Recipes', link: '/en/recipes/adding-a-new-action' },
              { text: 'Contributing', link: '/en/contributing/development-setup' },
              { text: 'Design Specs', link: '/en/superpowers/' },
              { text: 'Changelog', link: '/en/changelog' },
            ],
          },
          {
            text: `v${version}`,
            items: [{ text: 'Changelog', link: '/en/changelog' }],
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
        editLink: {
          pattern: 'https://github.com/SakuraPuare/apollo-map-studio/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
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
    search: {
      provider: 'local',
      options: {
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
        },
      },
    },
  },
});
