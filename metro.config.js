const { getDefaultConfig } = require('expo/metro-config'); // if using Expo
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('glb');
config.resolver.assetExts.push('gltf');

module.exports = config;
