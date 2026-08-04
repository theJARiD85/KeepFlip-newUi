const { withProjectBuildGradle } = require("@expo/config-plugins");

const START_MARKER =
  "// @generated keepflip-appodeal-repositories-start";
const END_MARKER =
  "// @generated keepflip-appodeal-repositories-end";

const REPOSITORIES = `
    ${START_MARKER}

    maven {
      url 'https://artifactory.appodeal.com/appodeal'

      content {
        includeGroupByRegex 'com[.]appodeal([.].*)?'
        includeGroupByRegex 'com[.]explorestack([.].*)?'
        includeGroupByRegex 'io[.]bidmachine([.].*)?'
        includeGroupByRegex 'org[.]bidon([.].*)?'
      }
    }

    maven {
      url 'https://dl-maven-android.mintegral.com/repository/mbridge_android_sdk_oversea/'

      content {
        includeGroupByRegex 'com[.]mbridge[.]msdk([.].*)?'
      }
    }

    maven {
      url 'https://s3.amazonaws.com/smaato-sdk-releases/'

      content {
        includeGroupByRegex 'com[.]smaato[.]android[.]sdk([.].*)?'
      }
    }

    ${END_MARKER}
`;

module.exports = function withAppodealRepository(config) {
  return withProjectBuildGradle(config, (projectConfig) => {
    if (projectConfig.modResults.language !== "groovy") {
      throw new Error(
        "KeepFlip Appodeal integration requires Groovy android/build.gradle.",
      );
    }

    let contents = projectConfig.modResults.contents;

    // Remove the previously generated block to avoid duplicates.
    const generatedBlock = new RegExp(
      `\\s*${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(
        END_MARKER,
      )}\\s*`,
      "g",
    );

    contents = contents.replace(generatedBlock, "\n");

    const repositoriesOpening =
      /(allprojects\s*\{\s*repositories\s*\{\s*\n)/;

    if (!repositoriesOpening.test(contents)) {
      throw new Error(
        "Could not find allprojects.repositories in android/build.gradle.",
      );
    }

    projectConfig.modResults.contents = contents.replace(
      repositoriesOpening,
      `$1${REPOSITORIES}`,
    );

    return projectConfig;
  });
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}