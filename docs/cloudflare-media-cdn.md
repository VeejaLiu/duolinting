# Cloudflare 媒体 CDN

本项目的课程媒体使用 MinIO 保存。启用本方案后，学习端拿到的地址为
`https://<学习站域名>/media/<bucket>/<objectName>`；请求流为：

```text
学习者 → Cloudflare 边缘缓存 → reverse-proxy /media/ → MinIO
```

这条路径不会经过 Express。课程、登录、进度等 `/api/` 请求保持原路径，不能加入
媒体缓存规则。

## 服务器配置

在服务器的私有 `.env` 中设置：

```dotenv
MEDIA_PUBLIC_BASE_URL=https://<学习站域名>/media
```

地址必须是公开 HTTPS URL，不能包含账号、密码、查询参数或片段。保存后，后端会：

1. 为当前 MinIO bucket 写入只允许 `s3:GetObject` 的匿名读取策略；不会开放列举、上传或删除。
2. 让新上传和已有课程 API 返回 CDN 媒体地址；数据库仍保存内部 `/api/v1/media/objects?key=...` 引用，以兼容对象清理与未启用 CDN 的回退。
3. 由生产 Nginx 将 `/media/<bucket>/<objectName>` 直接转给 MinIO，并传递 `Range` / `If-Range`，支持视频拖动与断点续播。

生产编排已将 MinIO 端口限制为服务器 loopback，禁止把该端口作为公网播放地址或 Cloudflare DNS 的源站。

## Cloudflare 配置

1. 把学习站域名接入 Cloudflare，并将 DNS 记录保持为“已代理”（橙色云）。
2. SSL/TLS 模式选择 **Full (strict)**，源站证书必须覆盖该学习站域名。
3. 创建 **Cache Rule**：
   - If: `URI Path starts with /media/`
   - Then: `Eligible for cache`，Edge TTL 设为 `1 year`，Browser TTL 设为 `1 year`
4. 不要为 `/api/` 创建缓存规则，尤其不能缓存认证、进度、后台或上传接口。
5. 若媒体文件大于当前 Cloudflare 套餐的单文件缓存上限，它会回源但不会被边缘缓存；将单节视频保持在该上限以内。

验证时查看媒体响应的 `CF-Cache-Status`：首次正常为 `MISS`，再次请求同一对象应为
`HIT`。同时确认响应保留 `Accept-Ranges` 和 `Content-Range`。

## 部署顺序

此变更只涉及 `backend` 和 `reverse-proxy` 配置，不需要数据库迁移：

1. 在私有服务器 `.env` 写入 `MEDIA_PUBLIC_BASE_URL`。
2. 按项目部署流程同步已提交代码并构建 `backend` 镜像。
3. 切换 `backend`，再重新创建 `reverse-proxy` 让 Nginx 读取 `/media/` 配置。
4. 访问一节已有课程确认返回的媒体 URL 已指向 `/media/`，并检查 Cloudflare 缓存状态。

如果需要紧急回退，清空 `MEDIA_PUBLIC_BASE_URL` 并切回后端；课程数据不需要恢复，因为
内部保存的媒体引用没有被改写。
