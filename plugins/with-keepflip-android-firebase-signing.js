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

function groovyBlockBounds(contents, declaration, fileName) {
  const declarationStart = contents.indexOf(declaration);
  const openingBrace = contents.indexOf("{", declarationStart);
  if (declarationStart === -1 || openingBrace === -1) {
    throw new Error(
      `Unable to apply KeepFlip Firebase/signing setup: expected ${declaration.trim()} block in ${fileName}.`,
    );
  }

  let depth = 0;
  for (let index = openingBrace; index < contents.length; index += 1) {
    if (contents[index] === "{") depth += 1;
    if (contents[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { end: index + 1, start: declarationStart };
      }
    }
  }

  throw new Error(
    `Unable to apply KeepFlip Firebase/signing setup: ${declaration.trim()} block is not closed in ${fileName}.`,
  );
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

    const debugBlock = groovyBlockBounds(
      contents,
      "        debug {",
      "android/app/build.gradle",
    );
    const debugContents = contents.slice(debugBlock.start, debugBlock.end);
    const localReleaseSigningInDebug = `            if (${KEYSTORE_PROPERTIES_FILE}.exists()) {\n                signingConfig signingConfigs.release\n            }`;
    if (debugContents.includes(localReleaseSigningInDebug)) {
      contents =
        contents.slice(0, debugBlock.start) +
        debugContents.replace(localReleaseSigningInDebug, "") +
        contents.slice(debugBlock.end);
    }

    const releaseBlock = groovyBlockBounds(
      contents,
      "        release {",
      "android/app/build.gradle",
    );
    const releaseContents = contents.slice(releaseBlock.start, releaseBlock.end);
    if (!releaseContents.includes("signingConfig signingConfigs.release")) {
      const debugSigning = "            signingConfig signingConfigs.debug";
      const localReleaseSigning = `            // Local builds use the private keystore; EAS injects managed credentials.\n            if (${KEYSTORE_PROPERTIES_FILE}.exists()) {\n                signingConfig signingConfigs.release\n            }`;
      const updatedReleaseContents = releaseContents.includes(debugSigning)
        ? releaseContents.replace(debugSigning, localReleaseSigning)
        : releaseContents.replace(
          "        release {\n",
          `        release {\n${localReleaseSigning}\n`,
        );
      if (updatedReleaseContents === releaseContents) {
        throw new Error(
          "Unable to apply KeepFlip release signing: expected release signing block is missing.",
        );
      }
      contents =
        contents.slice(0, releaseBlock.start) +
        updatedReleaseContents +
        contents.slice(releaseBlock.end);
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
    const keystoreSourcePath = path.resolve(projectRoot, keystoreFile);
    const hasProperties = fs.existsSync(propertiesSourcePath);
    const hasKeystore = fs.existsSync(keystoreSourcePath);

    // A clean checkout deliberately has no private signing files. In that
    // case EAS supplies its managed credentials after prebuild. Treat a
    // partial local setup as an error so local release builds cannot silently
    // use the wrong key.
    if (!hasProperties && !hasKeystore) {
      return modConfig;
    }
    if (!hasProperties) {
      throw new Error(
        `KeepFlip release signing properties are missing at ${propertiesSourcePath}.`,
      );
    }
    if (!hasKeystore) {
      throw new Error(
        `KeepFlip release keystore is missing at ${keystoreSourcePath}.`,
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

    const appDirectory = path.resolve(projectRoot, "android", "app");
    const keystoreDestinationPath = path.resolve(appDirectory, storeFile);
    const appDirectoryPrefix = `${appDirectory}${path.sep}`;
    if (!keystoreDestinationPath.startsWith(appDirectoryPrefix)) {
      throw new Error(
        "KeepFlip release keystore must stay inside android/app.",
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
