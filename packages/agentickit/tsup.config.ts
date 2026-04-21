import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "server/index": "src/server/index.ts",
    "protocol/index": "src/protocol/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [
    "react",
    "react-dom",
    "react-hook-form",
    "ai",
    "@ai-sdk/react",
    // Optional peer-dep provider adapters — imported dynamically at runtime
    // in `server/handler.ts`. Declare them as externals so tsup does not
    // attempt to bundle code that the consumer may never install.
    "@ai-sdk/openai",
    "@ai-sdk/anthropic",
    "@ai-sdk/groq",
    "@ai-sdk/google",
    "@ai-sdk/mistral",
    "@openrouter/ai-sdk-provider",
  ],
});
