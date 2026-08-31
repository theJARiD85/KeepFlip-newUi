const path = require("path"); 
const { getDefaultConfig } = require("expo/metro-config"); 

const config = getDefaultConfig(__dirname); 

// 1. Safely append 3D models and ML files without wiping out defaults
config.resolver.assetExts.push("jpg", "jpeg", "png", "glb", "gltf","tflite");

// 2. Add modern JS modules required by Three.js / Fiber dependencies
config.resolver.sourceExts.push("cjs", "mjs");

// Gradle compiles React Native's included Gradle plugin inside node_modules. 
// On Windows, those generated directories can disappear between Metro's crawl 
// and watch phases, which makes the fallback watcher crash with ENOENT. 
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); 
const separator = String.raw`[\\/]`; 
const gradlePluginGeneratedOutput =
  /node_modules[\\/]@react-native[\\/]gradle-plugin[\\/](?:bin|build)(?:[\\/]|$)/;
// Metro normalizes Windows paths to forward slashes before testing this list,
// so this native-only Gradle output rule must accept both separators.
const expoModulesCoreGradlePluginGeneratedOutput =
  /node_modules[\\/]expo-modules-core[\\/]expo-module-gradle-plugin[\\/](?:bin|build)(?:[\\/]|$)/;
const existingBlockList = config.resolver.blockList 
  ? Array.isArray(config.resolver.blockList) 
    ? config.resolver.blockList 
    : [config.resolver.blockList] 
  : []; 

config.resolver.blockList = [ 
  ...existingBlockList, 
  gradlePluginGeneratedOutput, 
  expoModulesCoreGradlePluginGeneratedOutput, 
]; 

// Cleaned up the 'config;fig;' typo here
module.exports = config;

