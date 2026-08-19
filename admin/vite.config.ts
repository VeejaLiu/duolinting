import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 8102,
    // 自动打开浏览器由 VSCode 任务负责（见 .vscode/tasks.json 的 Open: Admin），
    // 浏览器选择属于个人偏好，不写进项目配置
    proxy: {
      /*
       * 与 web-app 一致：本地开发时 admin 走"同源 API"（见 app-config 的
       * normalizeApiBaseUrl：浏览器里 base 为空 → 请求 /api/v1/... 发到当前源）。
       * 生产里由 nginx 把 /api/ 代理到 backend；本地没有 nginx，
       * 所以由 Vite dev server 承担同样的代理角色，转发到 8100 端口的 backend。
       */
      // 必须带尾部斜线：`/api` 会把前端页面 `/api-keys` 也误代理到后端，
      // 使直接打开或刷新该页面变成后端的 "Cannot GET"。
      '/api/': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
      },
    },
  },
})
