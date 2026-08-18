const { withAppBuildGradle } = require("expo/config-plugins");

// Appodeal's AdMob adapter references this mediation SDK at runtime. Keeping it
// in a project config plugin means `expo prebuild --clean` restores it too.
const BIDON_ADAPTER =
  'implementation("com.appodeal.ads.sdk.adapters:bidon:0.14.0.0")';

function addBidonAdapter(contents) {
  if (contents.includes(BIDON_ADAPTER)) {
    return contents;
  }

  const dependenciesBlock = /(^\s*dependencies\s*\{)/m;
  if (!dependenciesBlock.test(contents)) {
    throw new Error(
      "Unable to add the Appodeal Bidon adapter: no dependencies block was found.",
    );
  }

  return contents.replace(
    dependenciesBlock,
    `$1\n    // Required by Appodeal's AdMob mediation bridge.\n    ${BIDON_ADAPTER}`,
  );
}

module.exports = function withAppodealBidon(config) {
  return withAppBuildGradle(config, (appGradleConfig) => {
    if (appGradleConfig.modResults.language !== "groovy") {
      throw new Error(
        "with-appodeal-bidon requires the Android app build file to use Groovy.",
      );
    }

    appGradleConfig.modResults.contents = addBidonAdapter(
      appGradleConfig.modResults.contents,
    );
    return appGradleConfig;
  });
};

module.exports.BIDON_ADAPTER = BIDON_ADAPTER;
module.exports.addBidonAdapter = addBidonAdapter;
