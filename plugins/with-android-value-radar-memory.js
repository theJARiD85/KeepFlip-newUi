const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require("expo/config-plugins");

const NETWORK_INSPECTOR_PROPERTY = "EX_DEV_CLIENT_NETWORK_INSPECTOR";
const MIN_SDK_PROPERTY = "android.minSdkVersion";
const GRADLE_JVMARGS_PROPERTY = "org.gradle.jvmargs";
const COMPILE_SDK_PROPERTY = "android.compileSdkVersion";
const BUILT_IN_KOTLIN_PROPERTY = "android.builtInKotlin";
const NEW_DSL_PROPERTY = "android.newDsl";
const ANDROID_GRADLE_PLUGIN_VERSION = "8.13.2";
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
      COMPILE_SDK_PROPERTY,
      BUILT_IN_KOTLIN_PROPERTY,
      NEW_DSL_PROPERTY,
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
      {
        type: "property",
        key: COMPILE_SDK_PROPERTY,
        value: "36",
      },
      {
        type: "property",
        key: BUILT_IN_KOTLIN_PROPERTY,
        value: "false",
      },
      {
        type: "property",
        key: NEW_DSL_PROPERTY,
        value: "false",
      },
    );

    return gradleConfig;
  });

  config = withProjectBuildGradle(config, (projectBuildGradle) => {
    let contents = projectBuildGradle.modResults.contents;

    const agpClasspathPattern =
      /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]+)?['"]\)/;
    if (!agpClasspathPattern.test(contents)) {
      throw new Error(
        "Could not set the Android Gradle Plugin version: root classpath was not found.",
      );
    }
    contents = contents.replace(
      agpClasspathPattern,
      `classpath('com.android.tools.build:gradle:${ANDROID_GRADLE_PLUGIN_VERSION}')`,
    );

    projectBuildGradle.modResults.contents = contents;
    return projectBuildGradle;
  });

  config = withAppBuildGradle(config, (appBuildGradle) => {
    const contents = appBuildGradle.modResults.contents;
    if (!/apply plugin: ["']org\.jetbrains\.kotlin\.android["']/.test(contents)) {
      appBuildGradle.modResults.contents = contents.replace(
        /apply plugin: ["']com\.android\.application["']\r?\n/,
        'apply plugin: "com.android.application"\napply plugin: "org.jetbrains.kotlin.android"\n',
      );
    }
    return appBuildGradle;
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
