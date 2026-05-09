import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { PilotChatView, usePilotAction, usePilotState } from "@hec-ovi/agentickit";
import { useShell } from "../shell-context";
import { newItemId } from "../data/store";
import { packingItemSchema } from "../data/types";
import { EmptyState } from "../components/empty-state";

export function PackingRoute() {
  const { tripId } = useParams<{ tripId: string }>();
  const { getTrip, upsertTrip } = useShell();
  const trip = tripId ? getTrip(tripId) : undefined;

  // The packing list IS the page state. Description carries the page-level
  // instruction (focus on packing) since there's no usePilotInstructions.
  usePilotState({
    name: "packing_list",
    description: trip
      ? `Packing list for trip "${trip.title}" (destination ${trip.destination}). The user is on the Packing page; favor packing-related actions over global trip changes. Use add_packing_item / toggle_packing_item / remove_packing_item.`
      : "No active trip. Ignore packing actions.",
    value: trip?.packing ?? [],
    schema: z.array(packingItemSchema),
  });

  usePilotAction({
    name: "add_packing_item",
    description: "Append an item to the packing list.",
    parameters: z.object({ text: z.string().min(1).max(120) }),
    handler: ({ text }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      upsertTrip({
        ...trip,
        packing: [...trip.packing, { id: newItemId("p"), text, packed: false }],
      });
      return { ok: true };
    },
  });

  usePilotAction({
    name: "toggle_packing_item",
    description: "Toggle the `packed` flag on one packing item by id.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      const found = trip.packing.some((p) => p.id === id);
      if (!found) return { ok: false, reason: "no such item" };
      upsertTrip({
        ...trip,
        packing: trip.packing.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p)),
      });
      return { ok: true };
    },
  });

  usePilotAction({
    name: "remove_packing_item",
    description: "Remove one packing item by id.",
    parameters: z.object({ id: z.string() }),
    handler: ({ id }) => {
      if (!trip) return { ok: false, reason: "no active trip" };
      upsertTrip({ ...trip, packing: trip.packing.filter((p) => p.id !== id) });
      return { ok: true };
    },
    mutating: true,
  });

  if (!trip) {
    return (
      <>
        <header className="hero">
          <h1 className="page-title">Packing</h1>
        </header>
        <Link to="/" className="btn">
          Back to trips
        </Link>
      </>
    );
  }

  const todo = trip.packing.filter((p) => !p.packed);
  const done = trip.packing.filter((p) => p.packed);
  const total = trip.packing.length;
  const progress = total === 0 ? 0 : Math.round((done.length / total) * 100);

  return (
    <>
      <header className="hero">
        <div className="row space-between">
          <h1 className="page-title">Packing</h1>
          <span className={`badge ${progress === 100 ? "success" : "accent"}`}>
            {done.length} / {total} packed · {progress}%
          </span>
        </div>
        <p className="page-subtitle">
          {trip.title} · {trip.destination}. Use the inline assistant below for quick "suggest 5
          items for a rainy week" without opening the sidebar.
        </p>
        <div className="packing-progress">
          <div
            className="packing-progress-fill"
            style={{ width: `${progress}%` }}
            aria-hidden="true"
          />
        </div>
      </header>

      <div className="packing-cols">
        <section className="card">
          <div className="row space-between">
            <h2 className="card-title">To pack</h2>
            <span className="badge">{todo.length}</span>
          </div>
          {todo.length === 0 ? (
            <EmptyState
              glyph="✓"
              title="All packed"
              description="Nothing left on this side. Anything to add?"
            />
          ) : (
            <ul className="packing-list">
              {todo.map((item) => (
                <li key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.packed}
                    onChange={() => {
                      upsertTrip({
                        ...trip,
                        packing: trip.packing.map((p) =>
                          p.id === item.id ? { ...p, packed: !p.packed } : p,
                        ),
                      });
                    }}
                    aria-label={`Pack ${item.text}`}
                  />
                  <span>{item.text}</span>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() =>
                      upsertTrip({
                        ...trip,
                        packing: trip.packing.filter((p) => p.id !== item.id),
                      })
                    }
                    aria-label={`Remove ${item.text}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="row space-between">
            <h2 className="card-title">Packed</h2>
            <span className="badge success">{done.length}</span>
          </div>
          {done.length === 0 ? (
            <EmptyState glyph="○" title="Nothing packed yet" />
          ) : (
            <ul className="packing-list">
              {done.map((item) => (
                <li key={item.id} className="packed">
                  <input
                    type="checkbox"
                    checked={item.packed}
                    onChange={() => {
                      upsertTrip({
                        ...trip,
                        packing: trip.packing.map((p) =>
                          p.id === item.id ? { ...p, packed: !p.packed } : p,
                        ),
                      });
                    }}
                    aria-label={`Unpack ${item.text}`}
                  />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="headless-chat">
        <h2 className="card-title">Inline packing assistant</h2>
        <p className="muted">
          The chat body below is <code>PilotChatView</code> rendered headlessly inside the page.
          Same chat stream as the sidebar, no chrome. Try: "add 5 items for a rainy spring week" or
          "remove the universal adapter".
        </p>
        <div style={{ minHeight: 320, marginTop: 12 }}>
          <PilotChatView
            labels={{
              emptyState: "Ask for packing-list edits inline.",
            }}
            suggestions={[
              "Add: travel umbrella, neck pillow, eye mask",
              "Suggest 3 things I'm probably forgetting",
              "Toggle 'Pocket WiFi voucher' as packed",
            ]}
          />
        </div>
      </section>

      <Link className="btn" to={`/trips/${trip.id}`}>
        Back to overview
      </Link>
    </>
  );
}
