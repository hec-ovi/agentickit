export interface CreatePilotHandlerOptions {
  /**
   * System prompt prepended to every turn. Typically composed at init time
   * from .pilot/RESOLVER.md + conventions.
   */
  system?: string;
  /**
   * Default model ID in Vercel AI SDK v6 format ("openai/gpt-4o", "anthropic/claude-sonnet-4-5", ...).
   * Overridable per-request via the message body.
   */
  model: string;
  /**
   * Called for every incoming request. Return headers/env to forward to
   * the model provider (e.g., API keys from process.env).
   */
  getProviderOptions?: () => Record<string, unknown>;
}

/**
 * Factory for a Next.js App Router POST handler.
 *
 * Target usage:
 *   // app/api/pilot/route.ts
 *   import { createPilotHandler } from "agentickit/server";
 *   export const POST = createPilotHandler({ model: "openai/gpt-4o" });
 *
 * Implementation pending — this stub returns a 501 so misconfigured
 * consumers get a clear error during development rather than a cryptic one.
 */
export function createPilotHandler(
  _options: CreatePilotHandlerOptions,
): (request: Request) => Promise<Response> {
  return async () =>
    new Response(
      JSON.stringify({
        error:
          "agentickit handler not implemented yet — this is the scaffold stub. " +
          "Real streamText integration ships in v0.1.",
      }),
      {
        status: 501,
        headers: { "content-type": "application/json" },
      },
    );
}
