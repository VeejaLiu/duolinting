const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin')

module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // Zustand's development tooling reads import.meta.env. SDK 54's
          // Hermes transform requires this opt-in to compile it for native/web.
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
          extensions: ['.ts', '.tsx', '.js', '.json'],
        },
      ],
      // npm hoists babel-preset-expo to the monorepo root, where automatic
      // Expo Router discovery cannot see mobile-app/node_modules. Enable the
      // SDK 54 Router transform explicitly so EXPO_ROUTER_APP_ROOT is inlined.
      expoRouterBabelPlugin,
      'react-native-reanimated/plugin',
    ],
  }
}
