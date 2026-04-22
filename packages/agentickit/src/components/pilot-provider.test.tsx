/**
 * Tests for `<Pilot>`. Covers basic rendering and context wiring. We
 * deliberately avoid triggering any `sendMessage` calls so the tests don't
 * reach out to the fake `/api/pilot` endpoint.
 */

import { cleanup, render } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PilotChatContext, PilotRegistryContext } from "../context.js";
import { Pilot } from "./pilot-provider.js";

afterEach(() => {
  cleanup();
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
});
