import type { ViewStyle } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'

/** Only the supplied edges receive padding. Insets and offsets are logical pixels. */
export function createSafeAreaPadding(
  insets: EdgeInsets,
  offsets: Partial<EdgeInsets>,
  web: boolean,
): ViewStyle {
  const padding: Record<string, number | string> = {}
  for (const edge of Object.keys(offsets) as (keyof EdgeInsets)[]) {
    const offset = offsets[edge]
    if (offset === undefined) continue
    const property = `padding${edge[0].toUpperCase()}${edge.slice(1)}`
    // SDK 58 Router disables web measurements during hydration. CSS env() keeps
    // spacing responsive to browser insets without introducing a measuring provider.
    padding[property] = web
      ? `calc(env(safe-area-inset-${edge}, 0px) + ${offset}px)`
      : insets[edge] + offset
  }
  // React Native Web accepts CSS length expressions; native ViewStyle only types
  // numeric/percentage lengths. CSS values are restricted to the web branch above.
  return padding as ViewStyle
}
