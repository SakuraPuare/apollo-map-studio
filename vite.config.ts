import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import accessGuard from 'access-guard/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createServer as createVitePressServer } from 'vitepress';

const ACCESS_GUARD_BLOCKLIST = ['daohu527', 'wheelos-tools', 'wheelos'];

const VENDOR_CHUNK_GROUPS: Record<string, string[]> = {
  'vendor-react': ['react', 'react-dom', 'scheduler', 'use-sync-external-store'],
  'vendor-map': [
    'maplibre-gl',
    '@maplibre/',
    '@mapbox/',
    'earcut',
    'gl-matrix',
    'kdbush',
    'murmurhash-js',
    'pbf',
    'potpack',
    'quickselect',
    'tinyqueue',
  ],
  'vendor-dockview': ['dockview', 'dockview-react'],
  'vendor-state': ['zustand', 'zundo', 'immer', 'xstate', '@xstate/react'],
  'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
  'vendor-tree': ['react-arborist'],
  'vendor-ui': ['@radix-ui/', 'cmdk', 'react-icons'],
};

function getNodeModulePackageName(id: string) {
  const normalizedId = id.split(path.sep).join('/');
  const lastNodeModulesIndex = normalizedId.lastIndexOf('/node_modules/');

  if (lastNodeModulesIndex === -1) {
    return null;
  }

  let packagePath = normalizedId.slice(lastNodeModulesIndex + '/node_modules/'.length);
  const nestedNodeModulesIndex = packagePath.lastIndexOf('/node_modules/');

  if (nestedNodeModulesIndex !== -1) {
    packagePath = packagePath.slice(nestedNodeModulesIndex + '/node_modules/'.length);
  }

  const segments = packagePath.split('/');

  if (segments[0]?.startsWith('@')) {
    return segments.slice(0, 2).join('/');
  }

  return segments[0] ?? null;
}

function getVendorChunkName(id: string) {
  const packageName = getNodeModulePackageName(id);

  if (!packageName) {
    return undefined;
  }

  for (const [chunkName, packagePatterns] of Object.entries(VENDOR_CHUNK_GROUPS)) {
    if (
      packagePatterns.some((pattern) => packageName === pattern || packageName.startsWith(pattern))
    ) {
      return chunkName;
    }
  }

  return packageName.startsWith('@') ? 'vendor-scoped' : 'vendor-misc';
}

const DOCS_BASE = '/docs/';

function vitePressDocsDevPlugin(): Plugin {
  let docsServer: ViteDevServer | undefined;

  return {
    name: 'apollo-map-studio:vitepress-docs-dev',
    apply: 'serve',
    async configureServer(server) {
      docsServer = await createVitePressServer('docs', {
        base: DOCS_BASE,
        middlewareMode: server.httpServer ? { server: server.httpServer } : true,
        hmr: server.httpServer ? { server: server.httpServer, path: '/docs-hmr' } : false,
      });

      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url ?? '/';

        if (requestUrl === '/docs' || requestUrl.startsWith(DOCS_BASE)) {
          docsServer?.middlewares(req, res, next);
          return;
        }

        next();
      });

      server.httpServer?.once('close', () => {
        void docsServer?.close();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    vitePressDocsDevPlugin(),
    accessGuard({ blocklist: ACCESS_GUARD_BLOCKLIST }),
    react(),
    tailwindcss(),
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // `maplibre-gl` is shipped as a prebuilt monolithic bundle, so once it's
    // isolated into its own vendor chunk there is no finer-grained split left
    // for the bundler to perform inside that package.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Keep heavy dependencies out of the main entry chunk so the bundle
        // can load in smaller parallel pieces and stay below Vite's warning limit.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          return getVendorChunkName(id);
        },
      },
    },
  },
});
