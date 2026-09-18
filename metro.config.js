const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const projectDirectory = (name) => {
  const pathPattern = path
    .resolve(__dirname, name)
    .split(path.sep)
    .map(escapeRegExp)
    .join('[\\\\/]');

  return new RegExp(`^${pathPattern}(?:[\\\\/]|$)`);
};

// 1. Safely append 3D models and ML files without wiping out defaults
config.resolver.assetExts.push("jpg", "jpeg", "png", "glb", "gltf", "tflite");

// 2. Add modern JS modules required by Three.js / Fiber dependencies
config.resolver.sourceExts.push("cjs", "mjs");

// Gradle compiles React Native's included Gradle plugin inside node_modules.
// On Windows, those generated directories can disappear between Metro's crawl
// and watch phases, which makes the fallback watcher crash with ENOENT.
const gradlePluginGeneratedOutput =
  /node_modules[\\/]@react-native[\\/]gradle-plugin[\\/](?:bin|build)(?:[\\/]|$)/;
// Metro normalizes Windows paths to forward slashes before testing this list,
// so this native-only Gradle output rule must accept both separators.
const expoModulesCoreGradlePluginGeneratedOutput =
  /node_modules[\\/]expo-modules-core[\\/]expo-module-gradle-plugin[\\/](?:bin|build)(?:[\\/]|$)/;

// Block non-app directories from Metro's crawl.  Without Watchman, the
// fallback watcher times out trying to traverse all of these on Windows.
const nonAppDirectories = [
  projectDirectory('.venv'),
  projectDirectory('.venv-tapseg'),
  projectDirectory('.gradle-pika-test'),
  projectDirectory('.gradle-user-home'),
  projectDirectory('.keepflip-gradle-user-home'),
  projectDirectory('.codex-adb-home'),
  projectDirectory('.backups'),
  projectDirectory('.dyad'),
  projectDirectory('backend'),
  projectDirectory('datasets'),
  projectDirectory('dist'),
  projectDirectory('output'),
  projectDirectory('runs'),
  projectDirectory('work'),
  projectDirectory('emails'),
  projectDirectory('docs'),
  projectDirectory('skills'),
  projectDirectory('tools'),
  // Block expo-dev-launcher Gradle plugin build artifacts
  /node_modules[\\/]expo-dev-launcher[\\/].*[\\/](?:bin|build)(?:[\\/]|$)/,
];

const existingBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...existingBlockList,
  gradlePluginGeneratedOutput,
  expoModulesCoreGradlePluginGeneratedOutput,
  ...nonAppDirectories,
];

// Increase watcher timeout for Windows without Watchman
config.watcher = {
  ...config.watcher,
  healthCheck: {
    enabled: true,
    interval: 60000,
    timeout: 300000,
    filePrefix: '.metro-health-check',
  },
};

module.exports = config;
