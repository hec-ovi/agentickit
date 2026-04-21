import { createPilotHandler } from "agentickit/server";

/**
 * Pilot API route.
 *
 * `createPilotHandler` returns a `(Request) => Promise<Response>` compatible
 * with any Web-Fetch runtime. Model strings use the Vercel AI Gateway format;
 * set `AI_GATEWAY_API_KEY` in `.env.local` to authenticate.
 */
export const POST = createPilotHandler({
  model: "openai/gpt-4o-mini",
  system: [
    "You are a concise, helpful assistant embedded in a todo-list app.",
    "You can read the user's current todos from the `todos` context entry and",
    "mutate the list through the registered tools (`add_todo`, `toggle_todo`,",
    "`remove_todo`). Prefer calling tools over describing what the user should",
    "do. When summarizing, reference items by their visible text — never by id.",
  ].join(" "),
  maxSteps: 5,
});
