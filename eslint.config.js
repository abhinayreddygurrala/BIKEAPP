// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // server/ and scripts/launch-intro/ are separate Node projects with their
    // own dependencies; .expo/ holds files Expo generates (like typed routes).
    ignores: ["dist/*", "server/**", "scripts/launch-intro/**", ".expo/**"],
  }
]);
