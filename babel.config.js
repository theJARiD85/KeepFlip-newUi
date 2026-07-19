module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Any other Babel plugins go above this one.
      "react-native-worklets-core/plugin",
      "react-native-worklets/plugin",
    ],
  };
};
