import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '**/dist/**',
    '**/node_modules/**',
    '**/*.tsbuildinfo',
    // 官网是独立项目，有自己的 ESLint 版本与配置；根项目 lint 不应跨项目加载它。
    'official-site/**',
  ]),
  {
    files: [
      'web-app/src/**/*.{ts,tsx}',
      'web-app/vite.config.ts',
      'admin/src/**/*.{ts,tsx}',
      'admin/vite.config.ts',
    ],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['backend/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
])
