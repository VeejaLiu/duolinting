import { Image, type ImageProps, type ImageContentFit } from 'expo-image'

// 调用方沿用 react-native Image 的 resizeMode 习惯，这里映射到 expo-image
// 的 contentFit；未指定时 expo-image 默认 cover。
const resizeModeToContentFit: Record<string, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'contain',
}

type AppImageProps = Omit<ImageProps, 'cachePolicy'> & {
  resizeMode?: string
}

/**
 * 全 app 统一的图片组件：expo-image 自带内存 + 磁盘双级缓存
 * （cachePolicy="memory-disk"，磁盘缓存跨启动生效），配合后端媒体接口的
 * Cache-Control: immutable 长缓存头，封面等静态图只下载一次。
 */
export function AppImage({ resizeMode, ...props }: AppImageProps) {
  return (
    <Image
      cachePolicy="memory-disk"
      contentFit={resizeMode ? resizeModeToContentFit[resizeMode] ?? 'cover' : undefined}
      {...props}
    />
  )
}
