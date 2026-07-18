module.exports = function (api) {
    api.cache(true);
  
    return {
      presets: ['babel-preset-expo'],
      plugins: [
        // Required for VisionCamera V4 frame processors.
        ['react-native-worklets-core/plugin'],
  
        // Keep this only if it is already manually configured.
        // Expo's Babel preset may configure it automatically.
        'react-native-worklets/plugin',
      ],
    };
  };