const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [
  ...new Set([...config.resolver.assetExts, "glb", "gltf", "tflite"]),
];

// Gradle compiles React Native's included Gradle plugin inside node_modules.
// On Windows, those generated directories can disappear between Metro's crawl
// and watch phases, which makes the fallback watcher crash with ENOENT.
const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const separator = String.raw`[\\/]`;
const gradlePluginRoot = escapeRegExp(
  path.join(__dirname, "node_modules", "@react-native", "gradle-plugin"),
);
const gradlePluginGeneratedOutput = new RegExp(
  `^${gradlePluginRoot}${separator}.*${separator}(?:bin|build)(?:${separator}|$)`,
);
const existingBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...existingBlockList,
  gradlePluginGeneratedOutput,
];

module.exports = config;