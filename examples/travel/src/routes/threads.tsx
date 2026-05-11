/**
 * Per-thread message persistence demo.
 *
 * Demonstrates `localRuntime({ initialMessages, onMessagesChange })` from
 * agentickit 0.2.0. The pattern: a parent component holds a
 * `Map<threadId, messages>`; switching threads constructs a fresh runtime
 * seeded from the map for the active id; switching back restores the
 * prior conversation byte-for-byte.
 *
 * Without the persistence options, switching the active runtime drops the
 * old chat history (because `useChat` reads its initial messages once on
 * mount and never re-syncs). With the options, history hops between
 * threads as the user picks them.
 *
 * This route nests its own `<Pilot>` so the global app sidebar isn't
 * affected. The chat body is rendered inline via `<PilotChatView>` so the
 * thread tabs sit above it.
 */

import { useMemo, useRef, useState } from "react";
import { Pilot, PilotChatView, localRuntime } from "@hec-ovi/agentickit";

type ThreadId = "alpha" | "beta" | "gamma";

interface ThreadMeta {
  id: ThreadId;
  title: string;
  hint: string;
}

const THREADS: ReadonlyArray<ThreadMeta> = [
  {
    id: "alpha",
    title: "Thread α",
    hint: "Try: 'plan a 3-day trip to Lisbon'",
  },
  {
    id: "beta",
    title: "Thread β",
    hint: "Try: 'what's the cheapest hotel in Tokyo?'",
  },
  {
    id: "gamma",
    title: "Thread γ",
    hint: "Try: 'what should I pack for Iceland in November?'",
  },
];

export function ThreadsRoute() {
  const [active, setActive] = useState<ThreadId>("alpha");

  // Per-thread message store. We use a ref Map (not state) because the
  // store is only consumed by the runtime factory at construction time;
  // we don't need React to re-render on every message append. The runtime
  // itself owns the React-side message state and pushes updates to us via
  // `onMessagesChange`.
  const storeRef = useRef<Map<ThreadId, ReadonlyArray<unknown>>>(new Map());

  // The runtime is rebuilt whenever `active` changes. The new instance
  // seeds `useChat` with the stored messages for that thread (or [] for a
  // fresh thread); subsequent message appends mirror back into the same
  // map slot via `onMessagesChange`. Switching back restores the prior
  // conversation because the seed array is the persisted slice.
  const runtime = useMemo(
    () =>
      localRuntime({
        apiUrl: "/api/pilot",
        initialMessages: storeRef.current.get(active) ?? [],
        onMessagesChange: (msgs) => {
          storeRef.current.set(active, msgs);
        },
      }),
    [active],
  );

  const meta = THREADS.find((t) => t.id === active);

  return (
    <>
      <header className="hero">
        <h1 className="page-title">Per-thread persistence</h1>
        <p className="page-subtitle">
          Three independent chat threads sharing one chat surface. Send a
          message in <code>α</code>, switch to <code>β</code>, send another,
          switch back. <code>α</code> still has its history. The wiring lives
          in <code>routes/threads.tsx</code>: a <code>Map&lt;threadId, messages&gt;</code>
          ref, plus <code>localRuntime({"{ initialMessages, onMessagesChange }"})</code>
          re-created whenever the active id changes.
        </p>
      </header>

      <section className="card">
        <div className="row wrap" style={{ gap: 8 }}>
          {THREADS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn compact ${active === t.id ? "primary" : ""}`}
              onClick={() => setActive(t.id)}
              aria-pressed={active === t.id}
            >
              {t.title}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Active: <strong>{meta?.title}</strong>. Hint: {meta?.hint}.
        </p>
      </section>

      <section className="card headless-chat">
        <Pilot runtime={runtime}>
          <PilotChatView
            labels={{
              emptyState:
                "Empty thread. Send a message, switch tabs, come back. Your messages stick to this thread.",
              inputPlaceholder: `Talk to ${meta?.title ?? "this thread"}...`,
            }}
          />
        </Pilot>
      </section>
    </>
  );
}
