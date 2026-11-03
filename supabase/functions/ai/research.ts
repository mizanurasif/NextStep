import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { HttpError, corsHeaders } from "./http.ts";
import { createApplicationTools } from "./applications.ts";
import type { Agent, ResearchEvent, SavedChat, Source } from "./agent.ts";
import { openaiAgent } from "./agent-openai.ts";
import { claudeAgent } from "./agent-claude.ts";

// Which AI answers: "openai" (the default) or "claude". Set AI_PROVIDER in the Supabase secrets to switch
const AGENTS: Record<string, Agent> = { openai: openaiAgent, claude: claudeAgent };
const agentName = Deno.env.get("AI_PROVIDER") ?? "openai";
const agent = AGENTS[agentName];
if (!agent) console.error(`Unknown AI_PROVIDER "${agentName}"; use "openai" or "claude"`);

const MAX_QUESTION_CHARS = 2_000;

const STATUS: Record<string, string> = {
  list_applications: "Checking your applications…",
  read_applications: "Reading your saved applications…",
};

export type ResearchRequest = {
  question: string;
  applicationId: string | null;
  // null for a new chat
  chat: SavedChat | null;
  utcOffsetMinutes: number;
};

export const parseResearchRequest = (body: Record<string, unknown>): ResearchRequest => {
  if (!agent) throw new HttpError(500, "Research isn't set up on the server");
  const { question, applicationId = null } = body;
  if (typeof question !== "string" || !question.trim()) throw new HttpError(400, "Type a question");
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpError(400, `Ask in under ${MAX_QUESTION_CHARS.toLocaleString()} characters`);
  }
  if (applicationId !== null && (typeof applicationId !== "string" || !applicationId)) {
    throw new HttpError(400, "applicationId must be an application's id");
  }

  // Older app versions sent an empty list for a new chat
  const history = Array.isArray(body.history) && body.history.length === 0 ? null : (body.history ?? null);
  let chat: SavedChat | null = null;
  if (history !== null) {
    const provider = typeof history === "object" && !Array.isArray(history) ? (history as SavedChat).provider : undefined;
    // Each AI keeps the chat in its own format, so a chat started with one can't go on with the other
    if (provider !== agent.name) throw new HttpError(409, "This chat was started with a different AI. Start a new one");
    chat = history as SavedChat;
    agent.checkHistory(chat);
  }

  const offset = Number(body.utcOffsetMinutes);
  // Real time zones run from UTC-12 to UTC+14
  const utcOffsetMinutes = Number.isInteger(offset) && offset >= -720 && offset <= 840 ? offset : 0;
  return { question: question.trim(), applicationId, chat, utcOffsetMinutes };
};

// Everything both agents need around the loop: the first message, the application tools (with a
// status line for each call), and the list of applications read, which become sources
const runResearch = async (
  request: ResearchRequest,
  user: { uid: string; idToken: string },
  send: (event: ResearchEvent) => void,
) => {
  const tools = createApplicationTools(user.uid, user.idToken, request.utcOffsetMinutes);
  const scoped = request.applicationId ? await tools.details(request.applicationId) : null;
  const read = new Map<string, string>();
  if (scoped) read.set(scoped.ref.id, scoped.ref.title);

  // Dates the tools show are in the user's time zone too
  const today = new Date(Date.now() + request.utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
  const opened = scoped
    ? `\n\nThe user opened this chat from one of their saved applications:\n<application>\n${scoped.text}\n</application>`
    : "";
  send({ type: "status", text: "Thinking…" });

  const { chat, webSources } = await agent.run({
    chat: request.chat,
    userMessage: `Today is ${today}.${opened}\n\n${request.question}`,
    runTool: async (name, input) => {
      send({ type: "status", text: STATUS[name] ?? "Working…" });
      const result = await tools.run(name, input);
      for (const application of result.read) read.set(application.id, application.title);
      return { content: result.content, isError: !!result.isError };
    },
    send,
  });

  const applicationSources = [...read].map(([id, title]): Source => ({ type: "application", id, title }));
  send({ type: "sources", sources: [...webSources, ...applicationSources] });
  return chat;
};

const friendlyError = (error: unknown) => {
  if (error instanceof HttpError) return error.message;
  if (error instanceof OpenAI.RateLimitError || error instanceof Anthropic.RateLimitError) {
    return "Research is busy right now. Try again in a minute";
  }
  if (error instanceof OpenAI.APIError || error instanceof Anthropic.APIError) {
    return "The research service had a problem. Please try again";
  }
  return "Something went wrong. Please try again";
};

// Streams server-sent events: status lines, the answer as it's written, its sources, and finally the
// chat to save. Errors after this point arrive as an "error" event, since the status is already sent
export const researchResponse = (request: ResearchRequest, user: { uid: string; idToken: string }) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: ResearchEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        send({ type: "done", history: await runResearch(request, user, send) });
      } catch (error) {
        // Never log the question or the chat: they can hold personal data. The message says why
        // the AI's API refused (wrong key, no credit…), which the user only sees as a short message
        console.error(`Research failed (${agent.name})`, error instanceof Error ? error.message : error);
        send({ type: "error", message: friendlyError(error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
};
