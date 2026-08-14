import { createAppRuntimeConfig } from '@duolinting/app-config'
import { Platform } from 'react-native'

const resolveMobileApiBaseUrl = () => {
  if (Platform.OS !== 'web' || !__DEV__ || typeof window === 'undefined') {
    return process.env.EXPO_PUBLIC_API_BASE_URL
  }

  /*
   * Expo Web 开发服务器不代理 /api；它与 backend 分别监听 8103 / 8100。
   * 真机调试需要在 .env 中配置电脑 LAN 地址，但该配置若直接进入 Web 包，
   * 浏览器会错误地请求一个可能已经变更的旧 IP。开发 Web 因此固定使用当前
   * 页面主机 + backend 端口：localhost、127.0.0.1 和 LAN IP 都能正确对应。
   * 生产包的 __DEV__ 为 false，保留空 base 以走同源 nginx /api 代理。
   */
  return `${window.location.protocol}//${window.location.hostname}:8100`
}

export const runtimeConfig = createAppRuntimeConfig({
  apiBaseUrl: resolveMobileApiBaseUrl(),
})
