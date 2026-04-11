// ESLint 9 flat config for Apollo Map Studio.
// Philosophy: type-aware linting is deliberately OFF — too slow in a
// geometry-heavy codebase, and `tsc --noEmit` already runs in CI. ESLint's
// job here is limited to React hooks correctness + idiomatic TS + basic
// bug-catching. Prettier handles formatting as a separate pipeline.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '.github', 'src/proto/**', '.husky', 'pnpm-lock.yaml'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React 19 — no need to import React. Hooks are the one thing we
      // want locked down.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Fast refresh: only named-export components from files that
      // Dockview discovers.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript ergonomics — off for things tsc already catches.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',

      // Plain JS rules we actively use.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'prefer-const': 'warn',
    },
  },
  // Test files get laxer rules.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  // editorMachine.ts carries a deliberate @ts-nocheck while the XState 5
  // generic inference bugs land upstream. TODO: remove with Phase 5 TS strict
  // sweep and migrate to the typed setup({}).createMachine(...) pattern.
  {
    files: ['src/core/fsm/editorMachine.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  // Workers have a different global set.
  {
    files: ['**/*.worker.ts'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },
  // Node CLI scripts (CI utilities) need node globals.
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Must come last — turns off rules that conflict with Prettier.
  prettierConfig,
);
