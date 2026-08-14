import { FontAwesome6 } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { colors } from '@duolinting/ui-tokens'
import { View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

export default function TabsLayout() {
  const { t } = useLanguage()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentGreen,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '900',
          marginTop: 4,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: '#e4eef8',
          borderTopWidth: 2,
          height: 82,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 12,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.study'),
          tabBarIcon: ({ color, focused }) => (
            <View
              className={`h-10 w-14 items-center justify-center rounded-[16px] ${
                focused ? 'bg-[#ecffe4]' : 'bg-transparent'
              }`}
            >
              <FontAwesome6 color={color} name="book-open" size={20} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t('tabs.leaderboard'),
          tabBarIcon: ({ color, focused }) => (
            <View
              className={`h-10 w-14 items-center justify-center rounded-[16px] ${
                focused ? 'bg-[#ecffe4]' : 'bg-transparent'
              }`}
            >
              <FontAwesome6 color={color} name="trophy" size={20} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          title: t('tabs.growth'),
          tabBarIcon: ({ color, focused }) => (
            <View
              className={`h-10 w-14 items-center justify-center rounded-[16px] ${
                focused ? 'bg-[#ecffe4]' : 'bg-transparent'
              }`}
            >
              <FontAwesome6 color={color} name="chart-line" size={20} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabs.account'),
          tabBarIcon: ({ color, focused }) => (
            <View
              className={`h-10 w-14 items-center justify-center rounded-[16px] ${
                focused ? 'bg-[#ecffe4]' : 'bg-transparent'
              }`}
            >
              <FontAwesome6 color={color} name="user" size={20} />
            </View>
          ),
        }}
      />
    </Tabs>
  )
}
