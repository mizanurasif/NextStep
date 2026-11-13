const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// The Anthropic SDK ships two builds of the same code. Its ES-module build has a circular import that
// crashes the app in development ("Cannot read property 'BetaToolRunner' of undefined"): Fast Refresh
// reads every export of a module as soon as it loads, before the cycle has finished setting them up.
// The CommonJS build doesn't crash this way, so the app always gets that one.
const anthropicSdk = require.resolve("@anthropic-ai/sdk");
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@anthropic-ai/sdk") return { type: "sourceFile", filePath: anthropicSdk };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativewind(config);
