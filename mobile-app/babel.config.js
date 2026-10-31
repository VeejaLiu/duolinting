module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // Zustand's development tooling reads import.meta.env. Hermes's
          // Hermes transform requires this opt-in to compile it for native/web.
          transformImportMeta: true,
          // NativeWind's preset owns the single Worklets transform below.
          worklets: false,
          reanimated: false,
        },
      ],
      'nativewind/babel',
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
      // SDK 58's preset supplies Router; NativeWind supplies interop and Worklets.
      // Avoid private preset imports and duplicate legacy Reanimated plugins.
    ],
  }
}
