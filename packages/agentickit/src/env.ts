/**
 * Environment helpers that avoid a hard `@types/node` dependency.
 *
 * `process.env.NODE_ENV` is available in every modern bundler environment
 * (webpack, vite, Next.js, esbuild) but TypeScript doesn't know about it
 * unless `@types/node` is installed. Rather than pull that in for a single
 * string, we read `process` off `globalThis` with a narrow fallback type.
 */

interface NodeLikeProcess {
  env?: Record<string, string | undefined>;
}

/**
 * True in development builds. Matches React's own convention: anything that
 * isn't explicitly `"production"` is treated as development, so
 * unset / `"test"` / `"development"` all return `true`. Bundlers ship a
 * defined `process.env.NODE_ENV` in production builds, so the asymmetry is
 * safe — dev warnings dead-code-eliminate in prod output.
 */
export function isDev(): boolean {
  const proc = (globalThis as { process?: NodeLikeProcess }).process;
  return proc?.env?.NODE_ENV !== "production";
}
