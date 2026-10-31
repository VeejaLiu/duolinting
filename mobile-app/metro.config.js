const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)
const appNodeModules = path.join(__dirname, 'node_modules')
// Expo owns expo-modules-core; it can be nested under Expo rather than exposed
// as an app dependency. Use that dependency scope as a fallback for its runtime.
const sdkResolutionPaths = [
  appNodeModules,
  path.dirname(require.resolve('expo/package.json', { paths: [appNodeModules] })),
]

// npm may hoist a package to the workspace root or keep it app-local. Resolve
// singleton runtimes from the mobile app in both cases so shared dependencies
// cannot mix a different React/React Native runtime into this SDK's bundle.
config.resolver.nodeModulesPaths = [
  appNodeModules,
  path.resolve(__dirname, '../node_modules'),
]
const sdkRuntimePrefixes = [
  'expo',
  'expo-modules-core',
  'react',
  'react-dom',
  'react-native',
  'react-native-reanimated',
  'react-native-worklets',
]
config.resolver.extraNodeModules = Object.fromEntries(
  sdkRuntimePrefixes.map((packageName) => [
    packageName,
    path.dirname(require.resolve(`${packageName}/package.json`, { paths: sdkResolutionPaths })),
  ]),
)
const defaultResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const runtimePackage = sdkRuntimePrefixes.find(
    (packageName) => moduleName === packageName || moduleName.startsWith(`${packageName}/`),
  )

  if (runtimePackage) {
    // Pin the package search scope, then let Metro resolve the original request.
    // Returning Node's resolved filename would bypass .native/.web selection,
    // conditional exports, and Expo's react-native -> react-native-web alias.
    const sdkContext = {
      ...context,
      originModulePath: path.join(__dirname, 'package.json'),
      disableHierarchicalLookup: true,
      nodeModulesPaths: [
        path.dirname(config.resolver.extraNodeModules[runtimePackage]),
        ...config.resolver.nodeModulesPaths,
      ],
    }
    return defaultResolveRequest
      ? defaultResolveRequest(sdkContext, moduleName, platform)
      : context.resolveRequest(sdkContext, moduleName, platform)
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, {
  input: './global.css',
})
