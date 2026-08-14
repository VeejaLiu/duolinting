const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)
const appNodeModules = path.join(__dirname, 'node_modules')

// The workspace root also has newer React Native dependencies for other apps.
// Resolve the mobile SDK's singleton runtime packages from this app first; mixing
// React Native 0.85 source with SDK 54's codegen breaks native event transforms.
config.resolver.nodeModulesPaths = [
  appNodeModules,
  path.resolve(__dirname, '../node_modules'),
]
config.resolver.extraNodeModules = {
  expo: path.join(appNodeModules, 'expo'),
  'expo-modules-core': path.join(appNodeModules, 'expo-modules-core'),
  react: path.join(appNodeModules, 'react'),
  'react-dom': path.join(appNodeModules, 'react-dom'),
  'react-native': path.join(appNodeModules, 'react-native'),
  'react-native-reanimated': path.join(appNodeModules, 'react-native-reanimated'),
  'react-native-worklets': path.join(appNodeModules, 'react-native-worklets'),
}

const sdkRuntimePrefixes = [
  'expo',
  'expo-modules-core',
  'react',
  'react-dom',
  'react-native',
  'react-native-reanimated',
  'react-native-worklets',
]
const defaultResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSdkRuntimeModule = sdkRuntimePrefixes.some(
    (packageName) => moduleName === packageName || moduleName.startsWith(`${packageName}/`),
  )

  if (isSdkRuntimeModule) {
    // Resolve subpaths such as react-native/src/... against SDK 54 as well.
    // extraNodeModules alone does not cover every deep import from hoisted packages.
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [appNodeModules] }),
    }
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, {
  input: './global.css',
})
