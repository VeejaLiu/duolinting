# DuolinTing Mobile App

`mobile-app` 是独立于 `web-app` 的 Expo learner 客户端。
它不会替代当前桌面优先的 `web-app`，只复用共享领域逻辑、API 契约和设计 tokens。

## 当前状态

- 已有独立的 Expo Router 路由壳
- 已接入邮箱登录 / 注册与会话恢复
- 已支持目录浏览、章节页、学习页、进度云同步、accepted-answer 反馈
- 已接入 `expo-audio` / `expo-video`

## 直接运行

仓库根目录：

```bash
npm run dev:backend
```

另开一个终端，在仓库根目录：

```bash
npm run dev:mobile-app
```

如果只跑 Web 版 Expo，也可以：

```bash
npm run web --workspace @duolinting/mobile-app
```

## API 地址

浏览器里的 Expo Web 生产包默认使用同源 API：

```text
/api/v1/...
```

也就是说，访问 `https://mobile.duolinting.cn` 时，请求会发到同一个域名下的
`/api/v1/...`，再由 mobile-app 的 nginx 把 `/api/` 代理到 `backend:4000`。
不要在生产 Web 包里写入 `http://127.0.0.1:8100`，因为浏览器里的
`127.0.0.1` 指用户自己的设备，不是服务器。

本地开发或真机调试原生 App 时，可以通过 `EXPO_PUBLIC_API_BASE_URL` 覆盖：

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8100 npm run dev:mobile-app
```

也可以先复制环境文件：

```bash
cp mobile-app/.env.example mobile-app/.env.local
```

注意：

- iOS/Android 模拟器通常也可以按各自环境访问本机开发服务
- 真机调试原生 App 时不能继续使用 `127.0.0.1`，需要改成你电脑的局域网 IP
- 生产构建时不要把 `EXPO_PUBLIC_API_BASE_URL` 设置为 `/api`，API client 的路径已经包含 `/api/v1`

例如：

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8100 npm run dev:mobile-app
```

## 当前已知边界

- 目前没有离线下载内容
- 还没有 Apple / Google 登录
- 还没有推送通知、打卡提醒、订阅付费
- 还没有完整自动化测试矩阵
