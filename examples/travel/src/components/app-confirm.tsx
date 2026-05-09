import type { PilotConfirmRender } from "@hec-ovi/agentickit";

/**
 * Custom renderConfirm for `<Pilot>`. Gives every mutating: true action a
 * branded modal that matches the rest of the app's surfaces. Approve/cancel
 * are both wired so canceling feeds `{ ok: false, reason }` back to the
 * model and approving runs the handler with the model's args.
 */
export const appConfirmRender: PilotConfirmRender = ({
  name,
  description,
  input,
  approve,
  cancel,
}) => (
  <div
    className="modal-backdrop"
    role="presentation"
    onClick={(e) => {
      if (e.target === e.currentTarget) cancel();
    }}
  >
    <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="ak-confirm-title">
      <h2 id="ak-confirm-title">
        Run <code>{name}</code>?
      </h2>
      {description ? <p className="muted" style={{ margin: 0 }}>{description}</p> : null}
      <div className="args">{JSON.stringify(input, null, 2)}</div>
      <div className="row space-between" style={{ marginTop: 4 }}>
        <button type="button" className="btn ghost" onClick={() => cancel()}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => approve()}>
          Approve and run
        </button>
      </div>
    </div>
  </div>
);
