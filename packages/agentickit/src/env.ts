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
 * True in development builds. Returns `false` when `process.env.NODE_ENV` is
 * unset (e.g. in browser-run tests) so dev-only warnings stay quiet unless
 * the consumer explicitly opts in.
 */
export function isDev(): boolean {
  const proc = (globalThis as { process?: NodeLikeProcess }).process;
  return proc?.env?.NODE_ENV !== "production";
}
