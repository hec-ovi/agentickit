import { createPilotHandler } from "agentickit/server";

/**
 * Pilot API route.
 *
 * The handler auto-loads `./.pilot/` at startup — RESOLVER.md plus every
 * `skills/<name>/SKILL.md` — and composes the system prompt from that markdown.
 * Change what the agent can do by editing those files; no TypeScript edit
 * required here.
 *
 * `model` is pinned to the local vLLM Responses API server (see
 * `.env.local`). Change to `"auto"` or remove the line to fall back to
 * whichever provider key is present in the environment.
 *
 * `debug` + `log` print every request and response to the Next.js terminal
 * and append them to `./debug/agentickit-YYYY-MM-DD.log`. Turn both off in
 * production. Logs never contain API keys.
 */
export const POST = createPilotHandler({
  model: "openai/gpt-oss-20b",
  maxSteps: 8,
  debug: true,
  log: true,
});
