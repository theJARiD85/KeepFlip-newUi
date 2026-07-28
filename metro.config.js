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

// Cleaned up the 'config;fig;' typo here
module.exports = config;

