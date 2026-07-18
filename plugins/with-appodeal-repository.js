const { withProjectBuildGradle } = require('@expo/config-plugins');

const APPODEAL_REPOSITORY_URL = 'https://artifactory.appodeal.com/appodeal';

module.exports = function withAppodealRepository(config) {
  return withProjectBuildGradle(config, (projectConfig) => {
    if (projectConfig.modResults.language !== 'groovy') {
      throw new Error('KeepFlip Appodeal integration requires a Groovy Android root build.gradle.');
    }

    const contents = projectConfig.modResults.contents;
    if (contents.includes(APPODEAL_REPOSITORY_URL)) {
      return projectConfig;
    }

    const repositoriesBlock = /(allprojects\s*\{\s*repositories\s*\{\s*\n)/;
    if (!repositoriesBlock.test(contents)) {
      throw new Error('Could not find the Android allprojects.repositories block for Appodeal.');
    }

    projectConfig.modResults.contents = contents.replace(
      repositoriesBlock,
      `$1        maven { url '${APPODEAL_REPOSITORY_URL}' }\n`,
    );

    return projectConfig;
  });
};
