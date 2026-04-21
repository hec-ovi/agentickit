import { createPilotHandler } from "agentickit/server";

/**
 * Pilot API route.
 *
 * `createPilotHandler` returns a `(Request) => Promise<Response>` compatible
 * with any Web-Fetch runtime. The default model below is an OpenRouter
 * free-tier model that supports tool calling (Qwen3 Coder) — copy
 * `.env.local.example` to `.env.local` and set `OPENROUTER_API_KEY` to run
 * this example without a credit card.
 *
 * Other supported shapes:
 *   - Direct provider keys: `"openai/gpt-4o"` with `OPENAI_API_KEY`,
 *     `"anthropic/claude-sonnet-4-5"` with `ANTHROPIC_API_KEY`, etc.
 *   - Vercel AI Gateway: set `AI_GATEWAY_API_KEY` and any prefix works.
 *   - Bring-your-own: pass a `LanguageModel` instance (Ollama, Azure, …).
 */
export const POST = createPilotHandler({
  model: "openrouter/qwen/qwen3-coder:free",
  system: [
    "You are a concise, helpful assistant embedded in a todo-list app.",
    "You can read the user's current todos from the `todos` context entry and",
    "mutate the list through the registered tools (`add_todo`, `toggle_todo`,",
    "`remove_todo`). Prefer calling tools over describing what the user should",
    "do. When summarizing, reference items by their visible text — never by id.",
  ].join(" "),
  maxSteps: 5,
});
