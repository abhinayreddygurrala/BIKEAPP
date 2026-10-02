// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // server/ is a separate Node project with its own dependencies;
    // .expo/ holds files Expo generates (like typed routes).
    ignores: ["dist/*", "server/**", ".expo/**"],
  }
]);
