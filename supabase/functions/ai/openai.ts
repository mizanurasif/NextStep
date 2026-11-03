import OpenAI from "openai";

// Reads OPENAI_API_KEY. Made on first use, so a missing key only breaks the features that need it
let client: OpenAI | null = null;
export const openai = () => (client ??= new OpenAI());

// Used for the research agent and for reading circulars
export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-6.1-terra";
