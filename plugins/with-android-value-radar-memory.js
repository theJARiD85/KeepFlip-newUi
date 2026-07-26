const {
  AndroidConfig,
  withAndroidManifest,
  withGradleProperties,
} = require("expo/config-plugins");

const NETWORK_INSPECTOR_PROPERTY = "EX_DEV_CLIENT_NETWORK_INSPECTOR";

/**
 * Keeps the Android development client from copying large binary model
 * responses into the Expo network inspector, and gives this camera/ML app
 * additional Java heap headroom on memory-constrained devices.
 */
module.exports = function withAndroidValueRadarMemory(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = gradleConfig.modResults.filter(
      (entry) =>
        entry.type !== "property" ||
        entry.key !== NETWORK_INSPECTOR_PROPERTY,
    );

    gradleConfig.modResults.push({
      type: "property",
      key: NETWORK_INSPECTOR_PROPERTY,
      value: "false",
    });

    return gradleConfig;
  });

  return withAndroidManifest(config, (manifestConfig) => {
    const application =
      AndroidConfig.Manifest.getMainApplicationOrThrow(
        manifestConfig.modResults,
      );

    application.$["android:largeHeap"] = "true";

    return manifestConfig;
  });
};
