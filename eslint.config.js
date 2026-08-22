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
    rules: {
      // 这些应用通过 effect 把异步目录、课程详情和媒体事件同步到本地 UI 状态；
      // 这是现有组件生命周期的一部分，不应被 React Hooks 的迁移提示当作错误。
      'react-hooks/set-state-in-effect': 'off',
      // 媒体播放与 WaveSurfer 使用 ref 连接 DOM/API 实例，渲染时读取其状态是该适配层的既有约定。
      'react-hooks/refs': 'off',
      // LanguageProvider 同时导出 provider、hook 和类型化标签表，拆分会增加无运行时价值的模块边界。
      'react-refresh/only-export-components': 'off',
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
