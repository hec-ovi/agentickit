/**
 * Tests for `<Pilot>`. Covers basic rendering, manifest fetching with
 * mocked `fetch`, and graceful failure when the manifest can't be loaded.
 * We deliberately avoid triggering any `sendMessage` calls so the tests
 * don't reach out to the fake `/api/pilot` endpoint.
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilotChatContext, PilotRegistryContext } from "../context.js";
import { Pilot } from "./pilot-provider.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("<Pilot>", () => {
  it("renders children", () => {
    const { getByText } = render(
      <Pilot apiUrl="/api/test">
        <div>hello</div>
      </Pilot>,
    );
    expect(getByText("hello")).toBeDefined();
  });

  it("provides both contexts to descendants", () => {
    let reg: React.ContextType<typeof PilotRegistryContext> = null;
    let chat: React.ContextType<typeof PilotChatContext> = null;

    function Spy() {
      reg = useContext(PilotRegistryContext);
      chat = useContext(PilotChatContext);
      return null;
    }

    render(
      <Pilot apiUrl="/api/test">
        <Spy />
      </Pilot>,
    );

    expect(reg).not.toBeNull();
    expect(chat).not.toBeNull();
    expect(chat?.status).toBe("ready");
    expect(chat?.isLoading).toBe(false);
    expect(Array.isArray(chat?.messages)).toBe(true);
  });

  it("fetches and parses the manifest when pilotProtocolUrl is set", async () => {
    const manifest = {
      version: 1,
      resolver: "RESOLVER.md",
      skills: [{ name: "greet", description: "say hi", path: "skills/greet/SKILL.md" }],
      conventions: ["be concise"],
    };

    const resolverMd =
      "# Resolver\n\n## Skills\n\n| Trigger | Skill |\n| --- | --- |\n| greet me | `skills/greet/SKILL.md` |\n";

    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.endsWith("manifest.json")) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (url.endsWith("RESOLVER.md")) {
        return new Response(resolverMd, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <Pilot apiUrl="/api/test" pilotProtocolUrl="/pilot">
        <div>ok</div>
      </Pilot>,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("manifest.json"));
    });
    // Second call fetches RESOLVER.md.
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).endsWith("RESOLVER.md"))).toBe(true);
    });
  });

  it("logs a warning and keeps working when the manifest fetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new Error("network down");
    });

    const { getByText } = render(
      <Pilot apiUrl="/api/test" pilotProtocolUrl="/pilot">
        <div>still working</div>
      </Pilot>,
    );

    expect(getByText("still working")).toBeDefined();
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load .pilot manifest"),
        expect.anything(),
      );
    });
  });

  it("does not fetch anything when pilotProtocolUrl is omitted", () => {
    render(
      <Pilot apiUrl="/api/test">
        <div>ok</div>
      </Pilot>,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
