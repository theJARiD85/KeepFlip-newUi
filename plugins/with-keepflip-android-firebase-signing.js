const fs = require("fs");
const path = require("path");
const {
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require("expo/config-plugins");

const APP_DISTRIBUTION_CLASSPATH =
  "classpath('com.google.firebase:firebase-appdistribution-gradle:5.3.0')";
const APP_DISTRIBUTION_PLUGIN =
  'apply plugin: "com.google.firebase.appdistribution"';
const FIREBASE_BOM =
  'implementation(platform("com.google.firebase:firebase-bom:34.17.0"))';
const FIREBASE_ANALYTICS =
  'implementation("com.google.firebase:firebase-analytics")';
const KEYSTORE_PROPERTIES_FILE = "keepFlipKeystorePropertiesFile";

function requireGroovy(gradleConfig, fileName) {
  if (gradleConfig.modResults.language !== "groovy") {
    throw new Error(
      `KeepFlip Firebase/signing setup requires a Groovy ${fileName} file.`,
    );
  }
}

function requireAnchor(contents, anchor, fileName) {
  if (!contents.includes(anchor)) {
    throw new Error(
      `Unable to apply KeepFlip Firebase/signing setup: expected anchor missing in ${fileName}.`,
    );
  }
}

/**
 * Reapplies the Firebase App Distribution, Analytics, and local release-signing
 * setup that Expo prebuild would otherwise replace. The Google Services plugin
 * and google-services.json copy are handled by android.googleServicesFile.
 */
module.exports = function withKeepFlipAndroidFirebaseSigning(config, options = {}) {
  const keystorePropertiesFile =
    options.keystorePropertiesFile || "./config/android/keystore.properties";
  const keystoreFile =
    options.keystoreFile || "./config/android/production-keystore.jks";

  config = withProjectBuildGradle(config, (gradleConfig) => {
    requireGroovy(gradleConfig, "android/build.gradle");

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes(APP_DISTRIBUTION_CLASSPATH)) {
      const anchor = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')";
      requireAnchor(contents, anchor, "android/build.gradle");
      contents = contents.replace(
        anchor,
        `${anchor}\n    ${APP_DISTRIBUTION_CLASSPATH}`,
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });

  config = withAppBuildGradle(config, (gradleConfig) => {
    requireGroovy(gradleConfig, "android/app/build.gradle");

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes(APP_DISTRIBUTION_PLUGIN)) {
      const anchor = 'apply plugin: "com.facebook.react"';
      requireAnchor(contents, anchor, "android/app/build.gradle");
      contents = contents.replace(anchor, `${anchor}\n${APP_DISTRIBUTION_PLUGIN}`);
    }

    if (!contents.includes(`def ${KEYSTORE_PROPERTIES_FILE}`)) {
      const anchor =
        "def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()";
      requireAnchor(contents, anchor, "android/app/build.gradle");
      contents = contents.replace(
        anchor,
        `${anchor}\n\ndef keepFlipKeystoreProperties = new Properties()\ndef ${KEYSTORE_PROPERTIES_FILE} = rootProject.file("keystore.properties")\n\nif (${KEYSTORE_PROPERTIES_FILE}.exists()) {\n    keepFlipKeystoreProperties.load(new FileInputStream(${KEYSTORE_PROPERTIES_FILE}))\n}`,
      );
    }

    if (!contents.includes("signingConfigs.release")) {
      const anchor = "    }\n    buildTypes {";
      requireAnchor(contents, anchor, "android/app/build.gradle");
      const releaseSigning = `        if (${KEYSTORE_PROPERTIES_FILE}.exists()) {\n            release {\n                storeFile file(keepFlipKeystoreProperties[\"storeFile\"])\n                storePassword keepFlipKeystoreProperties[\"storePassword\"]\n                keyAlias keepFlipKeystoreProperties[\"keyAlias\"]\n                keyPassword keepFlipKeystoreProperties[\"keyPassword\"]\n            }\n        }\n    }\n    buildTypes {`;
      contents = contents.replace(anchor, releaseSigning);
    }

    if (!contents.includes("signingConfig signingConfigs.release")) {
      const releaseStart = contents.indexOf("        release {");
      const debugSigning = "            signingConfig signingConfigs.debug";
      const debugSigningIndex = contents.indexOf(debugSigning, releaseStart);
      if (releaseStart === -1 || debugSigningIndex === -1) {
        throw new Error(
          "Unable to apply KeepFlip release signing: expected release signing block is missing.",
        );
      }
      const replacement = `            if (${KEYSTORE_PROPERTIES_FILE}.exists()) {\n                signingConfig signingConfigs.release\n            }`;
      contents =
        contents.slice(0, debugSigningIndex) +
        replacement +
        contents.slice(debugSigningIndex + debugSigning.length);
    }

    if (!contents.includes(FIREBASE_BOM) || !contents.includes(FIREBASE_ANALYTICS)) {
      const anchor = "dependencies {\n";
      requireAnchor(contents, anchor, "android/app/build.gradle");
      contents = contents.replace(
        anchor,
        `${anchor}    ${FIREBASE_BOM}\n    ${FIREBASE_ANALYTICS}\n`,
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });

  return withDangerousMod(config, ["android", async (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const propertiesSourcePath = path.resolve(
      projectRoot,
      keystorePropertiesFile,
    );
    const propertiesDestinationPath = path.resolve(
      projectRoot,
      "android",
      "keystore.properties",
    );

    if (!fs.existsSync(propertiesSourcePath)) {
      throw new Error(
        `KeepFlip release signing properties are missing at ${propertiesSourcePath}.`,
      );
    }

    const propertiesContents = await fs.promises.readFile(
      propertiesSourcePath,
      "utf8",
    );
    const storeFileLine = propertiesContents
      .split(/\r?\n/)
      .find((line) => line.startsWith("storeFile="));
    const storeFile = storeFileLine?.slice("storeFile=".length).trim();
    if (!storeFile || path.isAbsolute(storeFile)) {
      throw new Error(
        "KeepFlip release signing requires a relative storeFile in keystore.properties.",
      );
    }

    const keystoreSourcePath = path.resolve(projectRoot, keystoreFile);
    const appDirectory = path.resolve(projectRoot, "android", "app");
    const keystoreDestinationPath = path.resolve(appDirectory, storeFile);
    const appDirectoryPrefix = `${appDirectory}${path.sep}`;
    if (!keystoreDestinationPath.startsWith(appDirectoryPrefix)) {
      throw new Error(
        "KeepFlip release keystore must stay inside android/app.",
      );
    }
    if (!fs.existsSync(keystoreSourcePath)) {
      throw new Error(
        `KeepFlip release keystore is missing at ${keystoreSourcePath}.`,
      );
    }

    await fs.promises.mkdir(path.dirname(propertiesDestinationPath), {
      recursive: true,
    });
    await fs.promises.copyFile(propertiesSourcePath, propertiesDestinationPath);
    await fs.promises.mkdir(path.dirname(keystoreDestinationPath), {
      recursive: true,
    });
    await fs.promises.copyFile(keystoreSourcePath, keystoreDestinationPath);
    return modConfig;
  }]);
};
