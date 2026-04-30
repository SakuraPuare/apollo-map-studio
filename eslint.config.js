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
    ignores: ['dist', 'node_modules', '.github', 'src/proto/**', '.husky', 'pnpm-lock.yaml', '.claude/**'],
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

      // ── AI-friendly size & complexity caps ──────────────────────────
      // 小文件/小函数 = AI agent 能把整个单元装进上下文做局部推理。
      // 超出阈值通常意味着模块责任不单一——拆成兄弟子目录（参考
      // WorkspaceLayout/、mapEventRouter/、mapLibreInit/ 三处既有模式）。
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5],

      // ── 类型/导入卫生 ───────────────────────────────────────────────
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // 禁掉 `as unknown as X`——AI 卡住时最爱的"让 TS 闭嘴"模式。
      // 强制走类型化访问器/类型守卫/`in` 收敛（参考 2026-04 _source 清理）。
      'no-restricted-syntax': ['error', {
        selector: "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
        message: 'Avoid `as unknown as X`. Use a typed accessor, type guard, or `in` narrowing — see src/types/apollo.ts getSource/getSourceRect.',
      }],
      // 深相对路径 (`../../../`) 文件一移就断，AI 还得数点。强制用 `@/`。
      'no-restricted-imports': ['warn', {
        patterns: [{
          group: ['../../../*', '../../../../*'],
          message: 'Use the `@/` path alias instead of deep relative imports.',
        }],
      }],


      // Plain JS rules we actively use.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-template': 'warn',
      'object-shorthand': ['warn', 'always'],
    },
  },
  // 类型定义文件（discriminated union/schema 镜像）天然偏长，
  // 拆开会割裂联合体反而让 AI 导航更糟。豁免行数上限。
  {
    files: ['src/types/**/*.ts', 'src/proto/**/*.ts'],
    rules: { 'max-lines': 'off' },
  },
  // Test files get laxer rules.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'max-lines': ['warn', { max: 1500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-depth': 'off',
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
