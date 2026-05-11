/**
 * `{{NAME}}` agent — server-side handler.
 *
 * Wraps `createPilotHandler` with a focused system prompt + a model
 * resolved from env. Mount it into your existing Hono / Express /
 * Next.js / Bun server at the path you want, e.g.:
 *
 *   import { Hono } from "hono";
 *   import { {{NAME_CAMEL}}Handler } from "./{{NAME}}-agent";
 *
 *   const app = new Hono();
 *   app.all("/api/{{NAME}}", (c) => {{NAME_CAMEL}}Handler(c.req.raw));
 *
 * The client mounts a `<Pilot apiUrl="/api/{{NAME}}" />` to talk to it.
 * See `src/{{NAME}}-agent.tsx` for the matching client component.
 */

import { createPilotHandler } from "@hec-ovi/agentickit/server";

const SYSTEM_PROMPT = `
You are the {{NAME_PASCAL}} assistant.

Replace this prompt with the persona, scope, and house style for your
{{NAME_PASCAL}} agent. Keep it short and direct: the model reads it on
every turn. Cover what the agent IS for, what it is NOT for, how it
should reply (concise / verbose / formal / casual), and whether it
should call tools eagerly or wait to be asked.

When proposing actions that mutate user data, expect the confirm modal
to fire and adjust your follow-up text after the user decides.
`.trim();

export const {{NAME_CAMEL}}Handler = createPilotHandler({
  // Pulls a model string from PILOT_MODEL (e.g. "openai/gpt-4o-mini",
  // "anthropic/claude-haiku-4-5"). The handler resolves the prefix to
  // the right adapter via PROVIDER_ADAPTERS in the framework.
  model: process.env.PILOT_MODEL ?? "openai/gpt-4o-mini",
  system: SYSTEM_PROMPT,
  // Allow up to 5 tool-call iterations per user turn before the
  // framework caps. Bump if your agent does more orchestration; lower
  // if you want a tighter "single tool call → reply" pattern.
  maxSteps: 5,
  // Structured request-scoped logging. Comment this out for quieter
  // dev output, or wire `onLogEvent` to a custom sink in production.
  log: true,
});
