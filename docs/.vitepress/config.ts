import { defineConfig } from 'vitepress'
import { version } from '../../package.json'

// VITEPRESS_BASE is injected by GitHub Actions for sub-path deployment
// e.g. /apollo-map-studio/ when hosted at github.io/<repo>/
const base = process.env.VITEPRESS_BASE ?? '/'

export default defineConfig({
  title: 'Apollo Map Studio',
  description: 'Browser-based HD map editor for the Apollo autonomous driving platform',
  base,

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'API', link: '/api/geo-projection' },
      {
        text: `v${version}`,
        items: [{ text: 'Changelog', link: '/changelog' }],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Drawing Lanes', link: '/guide/drawing-lanes' },
            { text: 'Topology & Connections', link: '/guide/topology' },
            { text: 'Map Elements', link: '/guide/map-elements' },
            { text: 'Export', link: '/guide/export' },
            { text: 'Import', link: '/guide/import' },
            { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/overview' },
            { text: 'Coordinate System', link: '/architecture/coordinate-system' },
            { text: 'State Management', link: '/architecture/state-management' },
            { text: 'Export Engine', link: '/architecture/export-engine' },
            { text: 'Rendering Pipeline', link: '/architecture/rendering' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'geo/projection', link: '/api/geo-projection' },
            { text: 'geo/laneGeometry', link: '/api/geo-lane-geometry' },
            { text: 'geo/overlapCalc', link: '/api/geo-overlap-calc' },
            { text: 'proto/loader', link: '/api/proto-loader' },
            { text: 'proto/codec', link: '/api/proto-codec' },
            { text: 'proto/schema', link: '/api/proto-schema' },
            { text: 'export/buildBaseMap', link: '/api/export-base-map' },
            { text: 'export/buildSimMap', link: '/api/export-sim-map' },
            { text: 'export/buildRoutingMap', link: '/api/export-routing-map' },
            { text: 'import/parseBaseMap', link: '/api/import-parse-base-map' },
            { text: 'store/mapStore', link: '/api/store-map' },
            { text: 'store/uiStore', link: '/api/store-ui' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/SakuraPuare/apollo-map-studio' }],

    footer: {
      message: 'Released under the CC BY-NC-SA 4.0 License.',
      copyright: 'ShuYingJiYu',
    },

    search: {
      provider: 'local',
    },
  },
})
