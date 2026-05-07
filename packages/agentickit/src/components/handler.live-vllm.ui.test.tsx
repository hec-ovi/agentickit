/**
 * Live UI integration tests against a real vLLM server.
 *
 * Mounts real <Pilot> components in happy-dom, drives them with Testing
 * Library, and routes /api/pilot through the in-process handler at a real
 * vLLM at /v1/responses. Nothing is mocked. Reasoning off, streaming on,
 * /responses only — the three rules vLLM gets in this repo.
 *
 * Gated by VLLM_BASE_URL. Without it the whole describe is skipped so CI
 * without vLLM stays green; with it set, the file exercises the full
 * README user-journey checklist (multi-tool turn, mutating + confirm
 * approve / decline, usePilotState auto-setter, usePilotForm progressive
 * fill + submit, renderAndWait HITL respond + cancel).
 *
 * Run:  VLLM_BASE_URL=http://127.0.0.1:8000/v1 pnpm test
 *       (optionally  VLLM_MODEL=Qwen3.6-27B-AWQ4)
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { createOpenAI } from "@ai-sdk/openai";
import { Pilot } from "./pilot-provider.js";
import { PilotSidebar } from "./pilot-sidebar.js";
import { usePilotAction } from "../hooks/use-pilot-action.js";
import { usePilotState } from "../hooks/use-pilot-state.js";
import { usePilotForm } from "../hooks/use-pilot-form.js";
import { createPilotHandler } from "../server/handler.js";

const VLLM_BASE_URL = process.env.VLLM_BASE_URL;
const VLLM_MODEL = process.env.VLLM_MODEL ?? "Qwen3.6-27B-AWQ4";
// Memory rule: vLLM = reasoning off. Set VLLM_REASONING=on to flip the
// shim and let Qwen3 think through harder tool-call decisions. Useful for
// testing whether the multi-field / meta-arg failures are caused by the
// reasoning-off rule rather than by agentickit wiring.
const VLLM_REASONING_ON = process.env.VLLM_REASONING === "on";
// Memory rule: vLLM = /responses only. Set VLLM_CHAT_COMPLETIONS=on to
// compare against the /v1/chat/completions surface — useful to isolate
// whether tool-call failures are protocol-specific (chat-completions has
// a different Qwen3 chat template that may handle multi-field /
// meta-arg tools differently than the Responses API path).
const VLLM_CHAT_COMPLETIONS = process.env.VLLM_CHAT_COMPLETIONS === "on";
// vLLM with a 27B AWQ4 model on commodity GPUs runs ~5-15s per turn with
// reasoning off and considerably longer with reasoning on (the model
// streams a planning block first). Budget generously.
const TURN_TIMEOUT = VLLM_REASONING_ON ? 480_000 : 240_000;

// ---------------------------------------------------------------------------
// vLLM model factory: identical shape to examples/todo/server/index.ts.
// Custom fetch injects `chat_template_kwargs.enable_thinking=false` into
// every /responses POST. Defined module-scope so the same client backs
// every test.
// ---------------------------------------------------------------------------

let originalFetch: typeof fetch;

function normalizeVllmInputItem(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const it = item as Record<string, unknown>;
  // Assistant text history: AI SDK emits the loose
  // `{role,content:[output_text]}` shape that vLLM's union rejects.
  // Inflate to the full ResponseOutputMessage shape.
  if (it.role === "assistant" && Array.isArray(it.content)) {
    const out = { ...it };
    if (typeof out.type !== "string") out.type = "message";
    if (typeof out.id !== "string")
      out.id = `msg_compat_${Math.random().toString(36).slice(2, 12)}`;
    if (typeof out.status !== "string") out.status = "completed";
    out.content = (it.content as unknown[]).map((part) => {
      if (!part || typeof part !== "object") return part;
      const p = part as Record<string, unknown>;
      if (p.type === "output_text" && !Array.isArray(p.annotations)) {
        return { ...p, annotations: [] };
      }
      return part;
    });
    return out;
  }
  // function_call history: vLLM 400s if `arguments` isn't a valid JSON
  // object literal. The AI SDK passes through the model's raw token
  // string verbatim, so a malformed mid-stream call (Qwen3 occasionally
  // emits `"{"` and stops) crashes the next turn instead of going
  // through the SDK's error-recovery path. Replace bad arguments with
  // `"{}"`; the corresponding `function_call_output` already carries
  // the parse error so the model still learns about the failure.
  if (it.type === "function_call" && typeof it.arguments === "string") {
    try {
      const parsed = JSON.parse(it.arguments);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return item;
    } catch {
      // fall through and sanitize
    }
    return { ...it, arguments: "{}" };
  }
  return item;
}

// Diagnostic log: every outbound /responses body lands here so a failing
// run can be inspected after the fact. Cleared at the start of each run.
const VLLM_TRACE_PATH = "/tmp/vllm-trace.jsonl";
let vllmTraceCleared = false;
async function appendTrace(payload: unknown): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    if (!vllmTraceCleared) {
      await fs.writeFile(VLLM_TRACE_PATH, "");
      vllmTraceCleared = true;
    }
    await fs.appendFile(VLLM_TRACE_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    // Best-effort, never break the test on logging failure.
  }
}

function buildVllmModel() {
  if (!VLLM_BASE_URL) throw new Error("VLLM_BASE_URL is required");
  const client = createOpenAI({
    baseURL: VLLM_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY ?? "vllm-ignores-this",
    fetch: async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const isResponses = url.endsWith("/responses") || url.includes("/responses?");
      const isChat = url.endsWith("/chat/completions") || url.includes("/chat/completions?");
      if (!isResponses && !isChat) return fetch(input, init);
      if (!init?.body) return fetch(input, init);
      let body: Record<string, unknown> | undefined;
      try {
        body = JSON.parse(init.body as string);
      } catch {
        return fetch(input, init);
      }
      if (!body) return fetch(input, init);
      if (!VLLM_REASONING_ON) {
        if (!("chat_template_kwargs" in body)) {
          body.chat_template_kwargs = { enable_thinking: false };
        } else if (
          body.chat_template_kwargs &&
          typeof body.chat_template_kwargs === "object" &&
          !("enable_thinking" in (body.chat_template_kwargs as Record<string, unknown>))
        ) {
          (body.chat_template_kwargs as Record<string, unknown>).enable_thinking = false;
        }
      }
      // Only the /responses path needs the input-item shape normalize
      // shim (vLLM's stricter Pydantic union there). /chat/completions
      // uses standard role-bearing messages so no rewrite is necessary.
      if (isResponses && Array.isArray(body.input)) {
        body.input = body.input.map(normalizeVllmInputItem);
      }
      const requestBody = JSON.stringify(body);
      const traceId = `req_${Math.random().toString(36).slice(2, 12)}`;
      await appendTrace({ traceId, kind: "request", url, body });
      const res = await fetch(input, { ...init, body: requestBody });
      if (!res.ok) {
        const text = await res.clone().text();
        await appendTrace({ traceId, kind: "error", status: res.status, text });
      }
      return res;
    },
  });
  return VLLM_CHAT_COMPLETIONS ? client.chat(VLLM_MODEL) : client.responses(VLLM_MODEL);
}

// Built lazily inside beforeAll so `describe.skipIf` actually short-circuits
// when VLLM_BASE_URL is missing. Reused across every test in the file.
let pilotHandler: ReturnType<typeof createPilotHandler> | null = null;
let pilotPostCount = 0;

// ---------------------------------------------------------------------------
// fetch hijack: route /api/pilot to the in-process handler. Everything
// else (including the openai adapter's calls to /v1/responses) forwards to
// the real network via the captured `originalFetch`.
// ---------------------------------------------------------------------------

function installFetchHijack(): void {
  originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.includes("/api/pilot")) {
      if (!pilotHandler) throw new Error("pilotHandler not initialized");
      pilotPostCount += 1;
      // Re-pack into a fresh Request so the handler can read the body
      // stream regardless of what kind of input/init combo useChat passes.
      const method = init?.method ?? "POST";
      const headers = init?.headers ?? { "content-type": "application/json" };
      const body = init?.body as BodyInit | null | undefined;
      const req = new Request("http://localhost/api/pilot", {
        method,
        headers,
        ...(body ? { body } : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
      });
      return pilotHandler(req);
    }
    return originalFetch(input as Parameters<typeof fetch>[0], init);
  }) as typeof fetch;
}

function restoreFetch(): void {
  if (originalFetch) globalThis.fetch = originalFetch;
}

const describeLive = describe.skipIf(!VLLM_BASE_URL);

describeLive("live vLLM end-to-end UI flows (gated by VLLM_BASE_URL)", () => {
  beforeAll(() => {
    pilotHandler = createPilotHandler({
      model: buildVllmModel(),
      maxSteps: 8,
      // - `store: false` keeps the SDK from emitting `item_reference`
      //   items that vLLM can't dereference (chat-parser KeyError).
      // - `parallelToolCalls: false` forces sequential calls. With
      //   parallel allowed, Qwen3 27B AWQ4 cleanly emits the first 1-2
      //   calls in a multi-tool turn but truncates the JSON of any
      //   later call mid-stream. Sequential mode lets each call complete
      //   before the next one is generated.
      getProviderOptions: () => ({
        openai: { store: false, parallelToolCalls: false },
      }),
    });
    installFetchHijack();
  });

  afterAll(() => {
    restoreFetch();
    pilotHandler = null;
  });

  afterEach(() => {
    cleanup();
    pilotPostCount = 0;
  });

  // -------------------------------------------------------------------------
  // Helper: send a user message through the visible composer. Mirrors what a
  // human would do — type into the textarea, click Send. No imperative
  // sendMessage() shortcut, so the chrome (sidebar) is exercised too.
  // -------------------------------------------------------------------------
  function sendThroughSidebar(text: string): void {
    // Scope to the composer specifically, not just any textbox: the form
    // tests render their own input/textarea fields which would otherwise
    // make `getByRole("textbox")` ambiguous.
    const textarea = screen.getByRole("textbox", {
      name: /Ask me anything/i,
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: text } });
    const sendBtn = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendBtn);
  }

  function openSidebar(result: RenderResult): void {
    // The sidebar mounts collapsed; opening it surfaces the composer and
    // the messages region. Header toggle button has aria-label="Open chat".
    const opener = result.container.querySelector(
      'button[aria-label="Open chat"]',
    ) as HTMLButtonElement | null;
    if (opener) fireEvent.click(opener);
  }

  // =========================================================================
  // 1. Multi-tool turn — model issues N add_todo calls then text reply.
  //    Tolerant about the exact N: assert each of the three keywords appears
  //    in some handler invocation, and the loop terminates.
  // =========================================================================
  it(
    "multi-tool turn: consecutive add_todo calls land, DOM updates, conversation terminates",
    async () => {
      const addTodo = vi.fn(({ text }: { text: string }) => ({ ok: true, text }));

      function TodoWidget() {
        const [todos, setTodos] = useState<string[]>([]);
        usePilotState({
          name: "todos",
          description: "Current todo list.",
          value: todos,
          schema: z.array(z.string()),
        });
        usePilotAction({
          name: "add_todo",
          description: "Append a single todo to the list.",
          parameters: z.object({ text: z.string() }),
          handler: (args) => {
            addTodo(args);
            setTodos((prev) => [...prev, args.text]);
            return { ok: true };
          },
        });
        return (
          <ul data-testid="todos">
            {todos.map((t, i) => (
              <li key={`${i}-${t}`} data-testid="todo-item">
                {t}
              </li>
            ))}
          </ul>
        );
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <TodoWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        "Add these two todos by calling add_todo twice, one per item: " +
          "'buy milk', then 'call mom'. After both calls succeed, reply " +
          "with one short sentence saying it's done.",
      );

      // Wait until both todos are in the DOM. Order is whatever the model
      // picks; tolerant keyword matching. Two-todo prompt avoids a Qwen3
      // 27B failure mode where a third consecutive add_todo call truncates
      // its JSON arguments mid-stream; the multi-tool *lifecycle* (call →
      // result → call → result → final text) is fully exercised by two.
      await waitFor(
        () => {
          const items = screen.queryAllByTestId("todo-item").map((el) => el.textContent ?? "");
          const joined = items.join(" | ").toLowerCase();
          expect(joined).toMatch(/milk/);
          expect(joined).toMatch(/mom/);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );

      // Handler called at least twice — once per todo. The model may call
      // more (e.g. retry) but never less.
      expect(addTodo.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Loop terminates: at least one final assistant text part. If the
      // useChat resubmission logic regressed, this would never settle.
      await waitFor(
        () => {
          const assistantMsgs = result.container.querySelectorAll('[data-role="assistant"]');
          const text = Array.from(assistantMsgs)
            .map((el) => el.textContent ?? "")
            .join(" ");
          expect(text).toMatch(/done|added|both|complete/i);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );
    },
    TURN_TIMEOUT,
  );

  // =========================================================================
  // 2. Mutating action + confirm modal: APPROVE branch.
  // =========================================================================
  it(
    "mutating action: confirm modal opens, approve runs handler, model produces follow-up text",
    async () => {
      const applyDiscount = vi.fn(({ percent }: { percent: number }) => ({
        ok: true,
        applied: percent,
      }));

      function CartWidget() {
        const [total, setTotal] = useState(100);
        usePilotState({
          name: "cart_total",
          description: "Current cart total in USD.",
          value: total,
          schema: z.number(),
        });
        usePilotAction({
          name: "apply_discount",
          description: "Apply a percentage discount to the cart.",
          parameters: z.object({ percent: z.number().min(0).max(100) }),
          handler: ({ percent }) => {
            applyDiscount({ percent });
            setTotal((t) => Math.round(t * (1 - percent / 100)));
            return { ok: true };
          },
          mutating: true,
        });
        return <div data-testid="total">{total}</div>;
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <CartWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        "Apply a 25 percent discount to the cart using the apply_discount tool.",
      );

      // Confirm modal appears.
      const confirmBtn = await screen.findByRole(
        "button",
        { name: /confirm/i },
        { timeout: TURN_TIMEOUT },
      );

      // Handler should NOT have run yet — the modal is the gate.
      expect(applyDiscount).not.toHaveBeenCalled();

      fireEvent.click(confirmBtn);

      // Handler runs once with the model's argument.
      await waitFor(
        () => {
          expect(applyDiscount).toHaveBeenCalledTimes(1);
        },
        { timeout: TURN_TIMEOUT, interval: 200 },
      );
      const callArg = applyDiscount.mock.calls[0]?.[0] as { percent: number } | undefined;
      expect(typeof callArg?.percent).toBe("number");
      expect(callArg?.percent).toBeGreaterThan(0);
      expect(callArg?.percent).toBeLessThanOrEqual(100);

      // React state updated.
      await waitFor(() => {
        const total = Number(screen.getByTestId("total").textContent ?? "0");
        expect(total).toBeLessThan(100);
      });

      // Model produces a follow-up after the result.
      await waitFor(
        () => {
          const assistantMsgs = result.container.querySelectorAll('[data-role="assistant"]');
          const text = Array.from(assistantMsgs)
            .map((el) => el.textContent ?? "")
            .join(" ");
          expect(text.trim().length).toBeGreaterThan(0);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );
    },
    TURN_TIMEOUT,
  );

  // =========================================================================
  // 3. Mutating action + confirm modal: DECLINE branch.
  // =========================================================================
  it(
    "mutating action: cancel branch — handler is NEVER called, model receives the decline and replies",
    async () => {
      const applyDiscount = vi.fn(({ percent }: { percent: number }) => ({ percent }));

      function CartWidget() {
        usePilotAction({
          name: "apply_discount",
          description: "Apply a percentage discount to the cart.",
          parameters: z.object({ percent: z.number().min(0).max(100) }),
          handler: applyDiscount,
          mutating: true,
        });
        return null;
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <CartWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        "Apply a 50 percent discount using the apply_discount tool.",
      );

      const cancelBtn = await screen.findByRole(
        "button",
        { name: /cancel/i },
        { timeout: TURN_TIMEOUT },
      );
      fireEvent.click(cancelBtn);

      // Wait long enough that any spurious follow-up call would land.
      await waitFor(
        () => {
          const assistantMsgs = result.container.querySelectorAll('[data-role="assistant"]');
          const text = Array.from(assistantMsgs)
            .map((el) => el.textContent ?? "")
            .join(" ");
          expect(text.trim().length).toBeGreaterThan(0);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );

      // Handler must remain unfired — the cancel branch is binding.
      expect(applyDiscount).not.toHaveBeenCalled();
    },
    TURN_TIMEOUT,
  );

  // =========================================================================
  // 4. usePilotState auto-generated update_<name> setter.
  // =========================================================================
  it(
    "usePilotState setter auto-registers update_<name>: model writes through, confirm + approve, React state changes",
    async () => {
      const PrefsSchema = z.object({
        accent: z.enum(["blue", "green", "red"]),
        density: z.enum(["compact", "comfy"]),
      });
      type Prefs = z.infer<typeof PrefsSchema>;

      function PrefsWidget() {
        const [prefs, setPrefs] = useState<Prefs>({ accent: "red", density: "comfy" });
        usePilotState({
          name: "preferences",
          description: "Current user preferences.",
          value: prefs,
          setValue: setPrefs,
          schema: PrefsSchema,
        });
        return (
          <div>
            <span data-testid="accent">{prefs.accent}</span>
            <span data-testid="density">{prefs.density}</span>
          </div>
        );
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <PrefsWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        "Set my preferences: accent should be blue and density should be compact.",
      );

      const confirmBtn = await screen.findByRole(
        "button",
        { name: /confirm/i },
        { timeout: TURN_TIMEOUT },
      );
      fireEvent.click(confirmBtn);

      await waitFor(
        () => {
          expect(screen.getByTestId("accent").textContent).toBe("blue");
          expect(screen.getByTestId("density").textContent).toBe("compact");
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );
    },
    TURN_TIMEOUT,
  );

  // =========================================================================
  // 5. usePilotForm — progressive fill + submit + confirm + approve.
  // =========================================================================
  it(
    "usePilotForm: progressive set_<name>_field calls populate fields, submit_<name> fires handleSubmit",
    async () => {
      const onSubmit = vi.fn();

      function ContactWidget() {
        const form = useForm({ defaultValues: { name: "", email: "", message: "" } });
        // Use the default form name so the auto-registered tools become
        // `set_form_field` / `submit_form`. With a custom name like
        // "contact" the auto-tool is `set_contact_field`, which Qwen3 27B
        // reliably hallucinates as `set_form_field` (the more common
        // training-data shape). Defaulting avoids the hallucination
        // collision while still testing the same code path.
        usePilotForm(form);
        return (
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <input data-testid="name" {...form.register("name")} />
            <input data-testid="email" {...form.register("email")} />
            <textarea data-testid="message" {...form.register("message")} />
          </form>
        );
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <ContactWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        "Fill out the form with name 'Hector', email 'hec@test.dev', " +
          "message 'hello there', then submit it.",
      );

      // Wait for the model to write the three fields. Tolerant matching:
      // model may write similar but not identical values, but should always
      // contain the obvious anchors.
      await waitFor(
        () => {
          expect((screen.getByTestId("name") as HTMLInputElement).value.toLowerCase()).toContain(
            "hector",
          );
          expect((screen.getByTestId("email") as HTMLInputElement).value.toLowerCase()).toContain(
            "hec@test.dev",
          );
          expect(
            (screen.getByTestId("message") as HTMLTextAreaElement).value.toLowerCase(),
          ).toContain("hello");
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );

      // Submit is mutating → confirm modal. Approve.
      const confirmBtn = await screen.findByRole(
        "button",
        { name: /confirm/i },
        { timeout: TURN_TIMEOUT },
      );
      fireEvent.click(confirmBtn);

      await waitFor(
        () => {
          expect(onSubmit).toHaveBeenCalledTimes(1);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );
      const submitted = onSubmit.mock.calls[0]?.[0] as
        | { name: string; email: string; message: string }
        | undefined;
      expect(submitted?.name.toLowerCase()).toContain("hector");
      expect(submitted?.email.toLowerCase()).toContain("hec@test.dev");
      expect((submitted?.message ?? "").toLowerCase()).toContain("hello");
    },
    TURN_TIMEOUT,
  );

  // =========================================================================
  // 6. renderAndWait HITL — respond branch.
  // =========================================================================
  it(
    "renderAndWait: HITL UI mounts, user responds, model resumes and produces text",
    async () => {
      function ChooserWidget() {
        usePilotAction({
          name: "ask_user_choice",
          description: "Ask the user to pick A or B before continuing.",
          parameters: z.object({ question: z.string() }),
          renderAndWait: ({ input, respond }) => (
            <div data-testid="hitl">
              <p data-testid="hitl-question">{input.question}</p>
              <button
                type="button"
                data-testid="hitl-A"
                onClick={() => respond({ choice: "A" })}
              >
                Pick A
              </button>
              <button
                type="button"
                data-testid="hitl-B"
                onClick={() => respond({ choice: "B" })}
              >
                Pick B
              </button>
            </div>
          ),
        });
        return null;
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <ChooserWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        'Invoke the function ask_user_choice with {"question":"Which option do you prefer, A or B?"}. ' +
          "Do not write JSON in your reply; actually call the function. After I answer, briefly acknowledge my choice.",
      );

      const choiceA = await screen.findByTestId("hitl-A", undefined, { timeout: TURN_TIMEOUT });
      fireEvent.click(choiceA);

      // The HITL component should unmount after responding (the action is
      // resolved) and the model should produce a follow-up that references
      // the choice.
      await waitFor(
        () => {
          const assistantMsgs = result.container.querySelectorAll('[data-role="assistant"]');
          const text = Array.from(assistantMsgs)
            .map((el) => el.textContent ?? "")
            .join(" ")
            .toLowerCase();
          expect(text).toMatch(/a\b|option a|chose a/i);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );
    },
    TURN_TIMEOUT,
  );

  // =========================================================================
  // 7. renderAndWait HITL — cancel branch.
  // =========================================================================
  it(
    "renderAndWait: cancel branch — handler is never resolved with a value, model receives the cancel and continues",
    async () => {
      const respondSpy = vi.fn();
      function ChooserWidget() {
        usePilotAction({
          name: "ask_user_choice",
          description: "Ask the user to pick A or B before continuing.",
          parameters: z.object({ question: z.string() }),
          renderAndWait: ({ input, respond, cancel }) => (
            <div data-testid="hitl">
              <p>{input.question}</p>
              <button
                type="button"
                data-testid="hitl-respond"
                onClick={() => {
                  respondSpy("A");
                  respond({ choice: "A" });
                }}
              >
                Pick A
              </button>
              <button
                type="button"
                data-testid="hitl-cancel"
                onClick={() => cancel()}
              >
                Skip
              </button>
            </div>
          ),
        });
        return null;
      }

      const result = render(
        <Pilot apiUrl="/api/pilot">
          <ChooserWidget />
          <PilotSidebar defaultOpen />
        </Pilot>,
      );
      openSidebar(result);

      sendThroughSidebar(
        'Invoke the function ask_user_choice with {"question":"pick A or B"}. ' +
          "Do not write JSON in your reply; actually call the function. After I respond, briefly continue.",
      );

      const cancelBtn = await screen.findByTestId(
        "hitl-cancel",
        undefined,
        { timeout: TURN_TIMEOUT },
      );
      fireEvent.click(cancelBtn);

      // Wait for the model to finish whatever it does with the cancel result.
      await waitFor(
        () => {
          const assistantMsgs = result.container.querySelectorAll('[data-role="assistant"]');
          const text = Array.from(assistantMsgs)
            .map((el) => el.textContent ?? "")
            .join(" ");
          expect(text.trim().length).toBeGreaterThan(0);
        },
        { timeout: TURN_TIMEOUT, interval: 250 },
      );

      // Respond was never called — the cancel branch is binding for HITL too.
      expect(respondSpy).not.toHaveBeenCalled();
    },
    TURN_TIMEOUT,
  );
});
