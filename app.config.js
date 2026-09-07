const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFiles } = require('@expo/env');

// Expo recognizes .env, .env.local, .env.development, and .env.production.
// Keep the existing release file usable for local native release builds while
// still allowing EAS/system environment values to take precedence.
const releaseEnvPath = path.join(__dirname, '.env.release');

if (fs.existsSync(releaseEnvPath)) {
  loadEnvFiles([releaseEnvPath], { force: true, silent: true });
}

module.exports = ({ config }) => {
  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
  const hasExpoVideoPlugin = plugins.some((plugin) =>
    Array.isArray(plugin) ? plugin[0] === 'expo-video' : plugin === 'expo-video',
  );

  return {
    ...config,
    plugins: hasExpoVideoPlugin ? plugins : [...plugins, 'expo-video'],
  };
};
