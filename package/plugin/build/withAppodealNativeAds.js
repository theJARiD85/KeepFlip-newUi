const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require("expo/config-plugins");

const pkg = require("../../package.json");

const APPODEAL_REPOSITORIES = [
  {
    url: "https://artifactory.appodeal.com/appodeal",
    groups: [
      "com[.]appodeal([.].*)?",
      "com[.]explorestack([.].*)?",
      "io[.]bidmachine([.].*)?",
      "org[.]bidon([.].*)?",
    ],
  },
  {
    url: "https://dl-maven-android.mintegral.com/repository/mbridge_android_sdk_oversea/",
    groups: ["com[.]mbridge[.]msdk([.].*)?"],
  },
  {
    url: "https://s3.amazonaws.com/smaato-sdk-releases/",
    groups: ["com[.]smaato[.]android[.]sdk([.].*)?"],
  },
];

const ADMOB_ADAPTER =
  'implementation("com.appodeal.ads.sdk.adapters:admob:25.2.0.0")';

function repositoryBlock(repository, indent = "    ") {
  const contentLines = repository.groups
    .map((group) => `${indent}    includeGroupByRegex '${group}'`)
    .join("\n");

  return `${indent}maven {
${indent}  url '${repository.url}'
${indent}  content {
${contentLines}
${indent}  }
${indent}}`;
}

function addRepositories(source) {
  const missing = APPODEAL_REPOSITORIES.filter(
    (repository) => !source.includes(repository.url),
  );

  if (missing.length === 0) {
    return source;
  }

  const repositoriesPattern =
    /allprojects\s*\{\s*repositories\s*\{/m;

  const blocks = missing
    .map((repository) => repositoryBlock(repository, "    "))
    .join("\n\n");

  if (repositoriesPattern.test(source)) {
    return source.replace(
      repositoriesPattern,
      (match) => `${match}\n${blocks}`,
    );
  }

  return `${source.trimEnd()}

allprojects {
  repositories {
${blocks}
  }
}
`;
}

function addAdMobAdapter(source) {
  if (source.includes(ADMOB_ADAPTER)) {
    return source;
  }

  const dependenciesPattern = /dependencies\s*\{/m;
  if (!dependenciesPattern.test(source)) {
    throw new Error(
      "Appodeal Native Ads could not find the Android dependencies block.",
    );
  }

  return source.replace(
    dependenciesPattern,
    (match) =>
      `${match}\n    // Optional Appodeal AdMob adapter.\n    ${ADMOB_ADAPTER}`,
  );
}

function ensureGradleProperty(properties, key, minimumValue) {
  const existing = properties.find(
    (entry) =>
      entry.type === "property" &&
      entry.key === key,
  );

  if (existing) {
    const current = Number.parseInt(existing.value, 10);
    if (!Number.isFinite(current) || current < minimumValue) {
      existing.value = String(minimumValue);
    }
    return;
  }

  properties.push({
    type: "property",
    key,
    value: String(minimumValue),
  });
}

function ensurePermission(manifest, permissionName) {
  manifest.manifest["uses-permission"] ??= [];

  const alreadyPresent =
    manifest.manifest["uses-permission"].some(
      (entry) =>
        entry.$?.["android:name"] === permissionName &&
        entry.$?.["tools:node"] !== "remove",
    );

  if (!alreadyPresent) {
    manifest.manifest["uses-permission"].push({
      $: {
        "android:name": permissionName,
      },
    });
  }
}

function removePermission(manifest, permissionName) {
  manifest.manifest.$ ??= {};
  manifest.manifest.$["xmlns:tools"] ??=
    "http://schemas.android.com/tools";

  manifest.manifest["uses-permission"] ??= [];

  const existing =
    manifest.manifest["uses-permission"].find(
      (entry) =>
        entry.$?.["android:name"] === permissionName,
    );

  if (existing) {
    existing.$["tools:node"] = "remove";
    delete existing.$["android:maxSdkVersion"];
    return;
  }

  manifest.manifest["uses-permission"].push({
    $: {
      "android:name": permissionName,
      "tools:node": "remove",
    },
  });
}

function setAdMobMetadata(application, appId) {
  application["meta-data"] ??= [];

  const existing = application["meta-data"].find(
    (entry) =>
      entry.$?.["android:name"] ===
      "com.google.android.gms.ads.APPLICATION_ID",
  );

  if (existing) {
    existing.$["android:value"] = appId;
    return;
  }

  application["meta-data"].push({
    $: {
      "android:name":
        "com.google.android.gms.ads.APPLICATION_ID",
      "android:value": appId,
    },
  });
}

function withAppodealNativeAds(config, options = {}) {
  const {
    enableAdMob = false,
    adMobAppId,
    removeLocationPermissions = true,
  } = options;

  if (enableAdMob && !adMobAppId) {
    throw new Error(
      "enableAdMob is true, but adMobAppId was not provided.",
    );
  }

  config = withProjectBuildGradle(config, (projectConfig) => {
    projectConfig.modResults.contents = addRepositories(
      projectConfig.modResults.contents,
    );
    return projectConfig;
  });

  if (enableAdMob) {
    config = withAppBuildGradle(config, (appConfig) => {
      appConfig.modResults.contents = addAdMobAdapter(
        appConfig.modResults.contents,
      );
      return appConfig;
    });
  }

  config = withGradleProperties(config, (gradleConfig) => {
    ensureGradleProperty(
      gradleConfig.modResults,
      "android.minSdkVersion",
      24,
    );
    return gradleConfig;
  });

  config = withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults;
    const application =
      AndroidConfig.Manifest.getMainApplicationOrThrow(
        manifest,
      );

    ensurePermission(
      manifest,
      "android.permission.INTERNET",
    );
    ensurePermission(
      manifest,
      "android.permission.ACCESS_NETWORK_STATE",
    );
    ensurePermission(
      manifest,
      "com.google.android.gms.permission.AD_ID",
    );

    if (removeLocationPermissions) {
      removePermission(
        manifest,
        "android.permission.ACCESS_COARSE_LOCATION",
      );
      removePermission(
        manifest,
        "android.permission.ACCESS_FINE_LOCATION",
      );
    }

    if (enableAdMob) {
      setAdMobMetadata(application, adMobAppId);
    }

    return manifestConfig;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withAppodealNativeAds,
  pkg.name,
  pkg.version,
);
