const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo's metro-config handles monorepo resolution on its own for SDK 52+, so
// there are deliberately no watchFolders or nodeModulesPaths overrides here.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
