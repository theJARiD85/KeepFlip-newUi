const {
  AndroidConfig,
  withAndroidManifest,
  withGradleProperties,
} = require("expo/config-plugins");

const NETWORK_INSPECTOR_PROPERTY = "EX_DEV_CLIENT_NETWORK_INSPECTOR";
const MIN_SDK_PROPERTY = "android.minSdkVersion";
const GRADLE_JVMARGS_PROPERTY = "org.gradle.jvmargs";
const GRADLE_JVMARGS_VALUE =
  "-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8";

/**
 * Keeps the Android development client from copying large binary model
 * responses into the Expo network inspector, gives this camera/ML app
 * additional Java heap headroom, and enables the HardwareBuffer APIs used by
 * VisionCamera's Android GPU resizer.
 */
module.exports = function withAndroidValueRadarMemory(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    const managedProperties = new Set([
      NETWORK_INSPECTOR_PROPERTY,
      MIN_SDK_PROPERTY,
      GRADLE_JVMARGS_PROPERTY,
    ]);

    gradleConfig.modResults = gradleConfig.modResults.filter(
      (entry) =>
        entry.type !== "property" || !managedProperties.has(entry.key),
    );

    gradleConfig.modResults.push(
      {
        type: "property",
        key: NETWORK_INSPECTOR_PROPERTY,
        value: "false",
      },
      {
        type: "property",
        key: MIN_SDK_PROPERTY,
        value: "26",
      },
      {
        type: "property",
        key: GRADLE_JVMARGS_PROPERTY,
        value: GRADLE_JVMARGS_VALUE,
      },
    );

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
