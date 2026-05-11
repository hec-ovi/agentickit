import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Load `.env.local` into `process.env` for the test process. Without
 * this, the env-gated live integration tests (Tavily, Firecrawl, Serper,
 * OpenWeather) would always skip because vitest doesn't auto-load env
 * files. The dev server gets these via `tsx --env-file=.env.local`;
 * tests need their own loader since vitest spawns its own Node process.
 *
 * Missing file is fine — the live tests just skip via `skipIf(!KEY)`.
 */
function loadEnvLocal() {
  const path = resolve(__dirname, ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
loadEnvLocal();

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    // Server tests don't need a DOM — they're plain Node modules talking
    // to external HTTP. Forcing them onto happy-dom can confuse `fetch`
    // (intercepted by the DOM shim) and slow them down, so we run them
    // under the real Node environment.
    environmentMatchGlobs: [["server/**/*.test.ts", "node"]],
  },
});
