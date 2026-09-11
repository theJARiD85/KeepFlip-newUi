// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Expo SDK 57 runs React Compiler diagnostics on application code. The
    // compiler safely skips a component it cannot optimize, including the
    // intentional mutable Reanimated worklets and media-player refs in this
    // app. Keep these visible while they are migrated incrementally, without
    // allowing compiler-optimization coverage to block a release gate.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
