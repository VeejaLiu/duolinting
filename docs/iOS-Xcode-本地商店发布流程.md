# DuolinTing iOS：Xcode 本地商店发布流程

> 状态：正式流程。最后复核：2026-09-02。
>
> DuolinTing 的 iOS 商店包统一使用本机 Xcode 原生归档、验证和上传。EAS 云构建或自动提交不是正式发布路径；任何例外都必须先重新确认成品和目标应用。

## 1. 发布身份与设备策略

每次发布前先核对下面四项，避免把包上传到相似名称的其他应用：

| 项目 | 规范值 | 来源或位置 |
| --- | --- | --- |
| 商店应用 | DuolinTing | App Store Connect 应用条目 |
| App Store Connect Apple ID | `6801663945` | App Store Connect |
| iOS Bundle Identifier | `com.duolinting.app` | `mobile-app/app.json` |
| 版本号 / 构建号 | 以 `mobile-app/app.json` 当前值为准 | `expo.version` / `expo.ios.buildNumber` |

当前配置保留 `supportsTablet: true`。成品继续同时支持 iPhone 和 iPad；本轮产品决定不准备 iPad 商店截图，但这不等于关闭 iPad 支持。仍需在 iPad 上完成核心流程冒烟测试。若 App Store Connect 对当前设备支持提出截图阻断，应补齐截图，不能通过删除平板支持来绕过。

## 2. 发布前准备

### 2.1 代码和版本

- 确认工作区只包含本次发布需要的改动，并完成发布提交。
- 在 `mobile-app/app.json` 中更新 `expo.version`（产品版本变化时）和 `expo.ios.buildNumber`（每次上传都必须递增）。当前配置为 `0.1.0 (10)`。
- 不复用旧 Archive 或旧 IPA。每次上传都要从本次发布提交重新生成并核验。
- 生成的 `mobile-app/ios` 原生工程是本地 Xcode 发布入口。若 `app.json` 的原生配置或 Expo 插件有变化，先同步原生工程，再打开工作区：

  ```bash
  cd mobile-app
  npx expo prebuild --platform ios
  open ios/DuolinTing.xcworkspace
  ```

  `xcworkspace` 是正式入口，不要直接打开 `xcodeproj`。同步原生工程前，先确认没有需要保留的未提交原生手工修改。

### 2.2 质量和生产配置

- 安装依赖并构建共享包；执行仓库现有的类型检查、静态检查和构建检查。
- 生产构建只能注入正式 HTTPS `EXPO_PUBLIC_API_BASE_URL`。该值来自私有运行手册或发布环境，不写入仓库，不使用 `127.0.0.1`、局域网地址或 `/api`。
- 生产环境变量会在客户端构建时进入应用，必须在归档前后检查成品，确认没有调试地址、测试服务地址、调试开关或测试账号信息。
- 确认 `ITSAppUsesNonExemptEncryption`、麦克风权限文案、图标、启动图和 Bundle Identifier 均来自本次提交。

### 2.3 商店资料

在上传前准备好 App Store Connect 的资料，但审核账号密码只在 App Store Connect 中直接填写，不写入代码、台账、提交信息或截图：

- 名称、副标题、描述、关键词、分类、版权和支持联系方式。
- 年龄分级问卷、App Privacy 数据收集问卷和公开隐私政策链接。
- iPhone 商店截图。本轮不准备 iPad 商店截图，但保留 iPad 支持并完成 iPad 冒烟测试。
- App Review 审核账号、审核备注和联系人信息。
- 课程音频、视频、字幕、封面及翻译的发布权确认；当前版权字段为 `2026 Veeja Liu`。

## 3. Xcode 归档和上传

1. 从仓库根目录进入 `mobile-app`，完成生产配置和原生工程同步。
2. 打开 `mobile-app/ios/DuolinTing.xcworkspace`。
3. 在 Xcode 中选择 `DuolinTing` scheme、正确的 Apple Developer Team 和正式 Bundle Identifier。
4. 选择 `Any iOS Device (arm64)` 或连接的真机作为归档目标；不要选择模拟器。
5. 选择 `Product → Archive`，使用 Release 配置生成 Archive。
6. Archive 完成后，在 Organizer 中先执行 `Validate App`。所有错误和警告都要判断并处理，不能跳过验证直接上传。
7. 在 Organizer 中选择 `Distribute App → App Store Connect → Upload`，确认目标应用是 DuolinTing 后上传。
8. 等待 App Store Connect 完成 Processing，再在正确的 iOS 版本页面选择本次构建。
9. 将 Archive、导出包和验证记录保存在 `mobile-app/temp/` 等被忽略目录；不要把签名文件、证书、私钥或生产环境配置提交到 Git。

## 4. 上传后的成品核验

在 App Store Connect 选择构建前，逐项核对：

- 应用名称为 DuolinTing，Bundle Identifier 为 `com.duolinting.app`。
- 版本号和构建号与 `mobile-app/app.json`、本次 Archive 一致。
- 设备族包含 iPhone 和 iPad，`supportsTablet` 没有被意外关闭。
- 应用启动、登录、课程目录、音频/视频播放、学习进度同步、词汇/笔记、语言切换、退出登录和重新登录正常。
- 跟读录音首次使用时能正确触发麦克风权限，并且拒绝权限后应用仍可使用其他学习功能。
- 成品访问正式 HTTPS API，没有本机、局域网或测试接口地址。
- App Store Connect 的年龄分级、隐私问卷、版权声明、审核信息和截图均对应本次版本。

由于应用保留 iPad 支持，至少在一台 iPad 或对应的稳定模拟环境完成上述核心流程的冒烟测试；测试结果需要记录，但本轮不额外制作 iPad 商店截图。iPhone 截图仍是本次提交资料的一部分，必须来自非调试状态且不包含个人信息。

## 5. App Store Connect 提交流程

只有下面条件全部满足后，才提交审核：

- 本次 Xcode 上传的构建已完成 Processing，并已选到当前 iOS 版本。
- 名称、副标题、描述、关键词、分类、版权、年龄分级和隐私问卷已完成。
- iPhone 截图、支持链接、隐私政策链接和内容版权声明已完成。
- 审核账号能够从干净安装进入核心学习流程；审核备注写明登录入口和测试路径。
- 审核联系人信息已填写；账号密码只存在于 App Store Connect 的受保护字段中。
- 本次版本在 TestFlight 或真机上完成 iPhone 验收，且完成 iPad 冒烟测试。

提交后记录 Apple 的 Processing、审核和发布状态。审核被拒时，先记录具体 Guideline 条款和复现步骤，再决定修改代码、补充商店资料或重新上传新的构建号。

## 6. 禁止事项

- 不使用 EAS 云构建产物作为默认商店发布包，不使用自动提交绕过 Xcode 验证流程。
- 不把 Build 9 或其他历史 IPA 当作当前发布包；上传前必须核验本次构建号。
- 不把测试账号、密码、证书、私钥、生产 API 地址或审核联系人隐私信息写进 Git 跟踪文件。
- 不因本轮不准备 iPad 截图而删除 `supportsTablet` 或改变设备支持范围。
- 不在未确认目标 Apple ID 的情况下点击 Upload、选择构建或提交审核。

## 7. 发布记录模板

每次正式上传后在项目台账或受控发布记录中填写以下内容；敏感凭证只记录“已填写”，不记录具体值：

```text
发布日期：
发布提交：
产品版本：
iOS 构建号：
Bundle Identifier：
Xcode Archive 路径：
IPA 路径（如有）：
Xcode Validate 结果：
App Store Connect 上传结果：
TestFlight Processing 结果：
iPhone 真机验收：
iPad 冒烟测试：
商店资料 / 隐私 / 年龄分级 / 审核信息复核人：
备注：
```
