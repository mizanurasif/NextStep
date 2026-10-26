// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/ holds Deno Edge Functions, not app code
    ignores: ['dist/*', 'supabase/*'],
  },
]);
