import { fetch as expoFetch } from "expo/fetch";
import type AnthropicSDK from "@anthropic-ai/sdk";
import type OpenAISDK from "openai";

// The AIs a user can bring their own key for. What a key unlocks is decided in lib/ai/access.tsx
export type AiProvider = "openai" | "claude";

// What the user saved in Profile
export type AiKey = { provider: AiProvider; apiKey: string };

export const PROVIDERS: Record<AiProvider, { label: string; model: string; keyHint: string; isKeyShaped: (key: string) => boolean }> = {
    openai: {
        label: "OpenAI",
        model: "gpt-6.1-terra",
        keyHint: "sk-…",
        isKeyShaped: (key) => key.startsWith("sk-") && !key.startsWith("sk-ant-"),
    },
    claude: {
        label: "Claude",
        model: "claude-opus-5-5",
        keyHint: "sk-ant-…",
        isKeyShaped: (key) => key.startsWith("sk-ant-"),
    },
};

// The SDKs are large (the Anthropic one is over 200 modules) and only needed once the user asks the AI
// something, so they're run on first use instead of when the app starts. This also keeps the rest
// of the app working if an SDK ever fails to load: only the AI call shows an error.
// A `require` inside a function is bundled with the app but only runs when called. `import()` would
// put each SDK in a separate chunk in development, and that chunk would contain the wrong build of the
// Anthropic SDK (see metro.config.js): "Requiring unknown module"
const sdks: { openai?: typeof OpenAISDK; anthropic?: typeof AnthropicSDK } = {};

/* eslint-disable @typescript-eslint/no-require-imports -- a lazy require, see above */
export const loadOpenAI = async () => (sdks.openai ??= (require("openai") as typeof import("openai")).default);
export const loadAnthropic = async () =>
    (sdks.anthropic ??= (require("@anthropic-ai/sdk") as typeof import("@anthropic-ai/sdk")).default);
/* eslint-enable @typescript-eslint/no-require-imports */

// The SDK clients run on the phone and call the AI directly with the user's own key.
// - expo/fetch, because React Native's fetch can't read a response while it's still streaming
// - dangerouslyAllowBrowser: the SDKs refuse to run outside a server by default, to protect a
//   developer's key. Here the key belongs to the person holding the phone, so that risk doesn't apply
const clientOptions = (apiKey: string) => ({
    apiKey,
    fetch: expoFetch as unknown as typeof globalThis.fetch,
    dangerouslyAllowBrowser: true,
});

export const openaiClient = async (apiKey: string) => new (await loadOpenAI())(clientOptions(apiKey));
export const claudeClient = async (apiKey: string) => new (await loadAnthropic())(clientOptions(apiKey));

// Turns an SDK error into one short sentence for the user. A wrong key and an empty balance are the
// common ones, and the user can fix both in Profile or on the provider's site.
// An SDK error can only come from an SDK that's already loaded, so its error classes are in `sdks`
export const describeAiError = (error: unknown, provider: AiProvider) => {
    const name = PROVIDERS[provider].label;
    const SDK = provider === "openai" ? sdks.openai : sdks.anthropic;
    if (SDK) {
        if (error instanceof SDK.AuthenticationError) return `Your ${name} key was rejected. Check it in Profile`;
        if (error instanceof SDK.RateLimitError) return `${name} is busy or your account is out of credit. Try again in a minute`;
        if (error instanceof SDK.APIConnectionError) return "You're offline. Connect to the internet to use AI features";
        if (error instanceof SDK.APIError) return `${name} had a problem. Please try again`;
    }
    // Our own errors already carry a message meant for the user
    return error instanceof Error ? error.message : "Something went wrong. Please try again";
};
