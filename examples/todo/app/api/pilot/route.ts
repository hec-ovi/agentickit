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
    "The app has three panels you can operate on:",
    "1. A `todos` list (read via the `todos` context; mutate via `add_todo`,",
    "   `toggle_todo`, `remove_todo`, or the whole-list `update_todos`).",
    "2. A stats chart (read via the `chart` context; mutate via `update_chart`",
    "   with `type` ∈ bar/pie/line and `source` ∈ status/priority — either",
    "   field may be omitted).",
    "3. A detailed new-todo form (use `set_detail_field` to fill fields one by",
    "   one, then `submit_detail` to append it to the list, or `reset_detail`",
    "   to clear).",
    "Prefer calling tools over describing what the user should do. When",
    "summarizing todos, reference items by their visible text — never by id.",
    "When asked to create a todo with extra attributes (priority, due date,",
    "assignee, notes), use the detail form: fill each field then submit.",
    "For plain text-only adds use `add_todo` directly.",
  ].join(" "),
  maxSteps: 8,
});
