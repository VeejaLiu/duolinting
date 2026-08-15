# DuolinTing 官网

DuolinTing 官网是主仓库内的独立项目，负责产品介绍、网页学习端引导、Android APK 发布说明、隐私政策和使用条款。它不属于主仓库的 npm workspaces，也不依赖后端、数据库或共享 packages。

## 本地启动

需要 Node.js `22.13.1`（或任意 `>=22.13.0` 版本）。项目根目录中的 `.nvmrc` 已固定为 `22.13.1`。

```bash
nvm use
npm ci
npm run dev
```

VS Code 可直接运行 `Dev: Official Site`。该任务会选择 Node.js 22.13.1、启动官网，并在服务就绪后打开浏览器。

官网默认地址是 `http://localhost:3000`；当前本机环境也可通过 `http://[::1]:3000` 访问。若要使用“网页立即体验”，请同时启动主项目的 `Dev: Web App` 或 `Start All`。

## 网页学习端地址配置

“网页立即体验” / “Try on the web” 使用 `VITE_LEARNER_APP_URL`。这是公开的前端构建变量，不可放置密码、令牌或其他敏感信息。

| 场景 | 文件 | 当前地址 | 何时读取 |
| --- | --- | --- | --- |
| 本地 Test | `.env.development.local` | `http://127.0.0.1:8101` | `npm run dev` 启动时 |
| 本地生产构建验证 | `.env.production.local` | `https://app.duolinting.cn` | `npm run build` / `npm run start` 时 |
| 新环境模板 | `.env.example` | `https://your-learner-app.example.com` | 复制并填入环境地址后 |
| Docker 线上构建 | 主项目服务器 `.env` 中的 `OFFICIAL_SITE_LEARNER_APP_URL` | `https://app.duolinting.cn` | Docker image 构建时 |

`.env.development.local` 和 `.env.production.local` 被 Git 忽略，方便每台开发机维护不同的地址；`.env.example` 会提交到版本库作为字段模板。

Vite 会把 `VITE_*` 地址写入浏览器产物。因此：

- 修改本地 Test 地址后，必须重启 `Dev: Official Site`。
- 修改生产地址后，必须重新构建官网镜像并替换运行中的容器。
- 线上地址必须是学习端的公开 HTTPS 地址；不能写 `127.0.0.1`、`localhost` 或局域网 IP，因为它们在访问者浏览器中指向访问者自己的设备。
- 未配置地址时，官网会禁用“网页立即体验”，不会猜测或回退到本地地址。

## 质量检查

```bash
npm run lint
npm run build
npm test
```

`npm run build` 会同时生成 `dist/standalone`。Docker 镜像会基于该产物补齐 vinext 所需的 React 运行时，形成最小的 Node.js 服务镜像。

## Docker 与线上部署

官网由 [Dockerfile](Dockerfile) 构建为独立 Node.js 容器，容器内部监听 `3000` 端口。生产编排定义在主项目的 `docker-compose.prod.yml`，服务名为 `official-site`，公网入口为 `www.duolinting.cn`，由主项目的 HTTPS 反向代理转发。

线上部署使用主项目服务器 `/home/ubuntu/duolinting/.env` 中的两项非敏感配置：

```dotenv
OFFICIAL_SITE_LEARNER_APP_URL=https://app.duolinting.cn
OFFICIAL_SITE_PUBLIC_PORT=8083
```

不要用此项目的 `.env.production.local` 覆盖服务器根目录 `.env`。Docker Compose 会把 `OFFICIAL_SITE_LEARNER_APP_URL` 作为构建参数转换为镜像内的 `VITE_LEARNER_APP_URL`；运行时再修改环境变量不会更新已经构建的网页链接。

官网使用 `www.duolinting.cn`，学习端继续使用 `app.duolinting.cn`。部署前确认 DNS、HTTPS 证书和反向代理都已包含 `www.duolinting.cn`。完整的预检、构建、切换与验证顺序记录在主项目私有运行手册 `temp/deployment-runbook.local.md`；不要跳过其中的本地 Docker 预检。

## SEO 与搜索引擎收录

官网把 `https://www.duolinting.cn` 作为唯一公开规范域名。生产构建使用 `VITE_OFFICIAL_SITE_URL` 生成 canonical URL、`robots.txt`、`sitemap.xml`、Open Graph 与 JSON-LD；默认值已经是该地址。只有在预览环境中需要使用不同公开域名时才覆盖它。

官网会公开以下搜索发现资产：

- `https://www.duolinting.cn/robots.txt`
- `https://www.duolinting.cn/sitemap.xml`
- 中文页面：`/`、`/download`、`/contribute`、`/privacy`、`/terms`
- 英文页面：`/en`、`/en/download`、`/en/contribute`、`/en/privacy`、`/en/terms`

每个中英文对应页面都包含 canonical 与 `hreflang`，并将完整正文服务端输出。首页提供组织、网站、软件产品和 FAQ 结构化数据；贡献指南提供文章结构化数据。

### 域名切换后的 SEO 验收

部署到 `www` 后，先确认它不再跳转到 `app.duolinting.cn`，而是由官网容器返回页面。然后检查：

```bash
curl -I https://www.duolinting.cn/
curl https://www.duolinting.cn/robots.txt
curl https://www.duolinting.cn/sitemap.xml
curl -s https://www.duolinting.cn/contribute | rg 'canonical|application/ld\+json'
```

期望结果：所有官网页面返回 `200`，`robots.txt` 为纯文本并指向 `www` 的站点地图，`sitemap.xml` 为 XML，页面 canonical 也指向 `https://www.duolinting.cn`。

域名和 HTTPS 已切换并稳定后，由域名所有者完成以下一次性外部操作：

1. 在 [Google Search Console](https://search.google.com/search-console) 验证 `https://www.duolinting.cn` 前缀属性，提交 `https://www.duolinting.cn/sitemap.xml`。
2. 在 [Bing Webmaster Tools](https://www.bing.com/webmasters/) 验证同一站点并提交同一站点地图。
3. 用两者的 URL 检查工具请求首页、下载页和贡献指南的抓取；观察索引覆盖率与核心网页指标，修复任何抓取错误后再请求重新编入索引。

不要在 `app.duolinting.cn` 提交官网站点地图，也不要让 `www` 持续 301 到学习端；两者会使官网页面无法独立建立索引。

若仅在本机验证镜像，可从本目录运行：

```bash
docker build --build-arg VITE_LEARNER_APP_URL=https://app.duolinting.cn -t duolinting-official-site:local .
docker run --rm -p 3000:3000 duolinting-official-site:local
```

## 项目结构

- `app/`：官网页面、文案和发布配置。
- `app/content/learner-web.ts`：网页学习端入口的唯一读取点。
- `app/content/android-release.ts`：Android APK 发布清单；只有最终签名 APK 的 HTTPS 地址、文件大小、SHA-256 和日期齐全后才可标记发布。
- `public/`：来自实际学习端、移动端和管理端的产品素材。
- `Dockerfile`：线上独立运行镜像。
- `.openai/hosting.json`：现有 Sites 项目配置；本次没有执行 Sites 发布。
