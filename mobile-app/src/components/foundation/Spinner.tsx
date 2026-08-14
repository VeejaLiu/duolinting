import { ActivityIndicator } from 'react-native'
import { colors } from '@duolinting/ui-tokens'

export function Spinner() {
  return <ActivityIndicator color={colors.brand} />
}
