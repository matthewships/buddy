module.exports = function (api) {
  api.cache(true);
  return {
    // jsxImportSource routes JSX through NativeWind so className works on
    // React Native components; nativewind/babel adds the CSS interop.
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
