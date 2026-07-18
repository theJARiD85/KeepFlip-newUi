module.exports = function (api) {
    api.cache(true);
  
    return {
      presets: ['babel-preset-expo'],
      plugins: [  
        // Keep this only if it is already manually configured.
        // Expo's Babel preset may configure it automatically.
        'react-native-worklets/plugin',
        'react-native-reanimated/plugin'
      ],
    };
  };