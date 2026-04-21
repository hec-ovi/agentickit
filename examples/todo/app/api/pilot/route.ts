import { createPilotHandler } from "agentickit/server";

/**
 * Pilot API route.
 *
 * `createPilotHandler` returns a `(Request) => Promise<Response>` compatible
 * with any Web-Fetch runtime. We omit `model` here so the handler
 * auto-detects a provider from whichever API key is present in
 * `.env.local`: `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
 * `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`,
 * or `AI_GATEWAY_API_KEY` (checked in that order). Each provider maps to
 * a tool-calling-capable default model so "set any supported key, it
 * just works".
 *
 * To override, pass an explicit `model` — see the root README's "Server
 * handler" section for the accepted shapes (string, `LanguageModel`
 * instance, or thunk).
 */
export const POST = createPilotHandler({
  system: [
    "You are a concise, helpful assistant embedded in a todo-list app.",
    "You can read the user's current todos from the `todos` context entry and",
    "mutate the list through the registered tools (`add_todo`, `toggle_todo`,",
    "`remove_todo`). Prefer calling tools over describing what the user should",
    "do. When summarizing, reference items by their visible text — never by id.",
  ].join(" "),
  maxSteps: 5,
});
