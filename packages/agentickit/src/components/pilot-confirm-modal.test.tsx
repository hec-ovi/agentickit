/**
 * Tests for `<PilotConfirmModal>`. Covers:
 *
 *   1. The human-readable action name renders in the header.
 *   2. Description appears as the subtitle.
 *   3. Clicking Confirm fires `approve`.
 *   4. Clicking Cancel fires `cancel` and NOT `approve`.
 *   5. Backdrop click fires `cancel`.
 *   6. Escape key cancels, Enter key approves.
 *   7. Arguments block hides when the input is empty `{}`.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PilotConfirmModal } from "./pilot-confirm-modal.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("<PilotConfirmModal>", () => {
  it("renders the humanized action name as the title", () => {
    const noop = () => {};
    const { getByRole } = render(
      <PilotConfirmModal
        open
        name="remove_todo"
        description="Permanently remove a todo."
        input={{ id: "t1" }}
        approve={noop}
        cancel={noop}
      />,
    );
    const dialog = getByRole("alertdialog");
    expect(dialog.textContent).toContain("Remove todo");
    expect(dialog.textContent).toContain("Permanently remove a todo.");
  });

  it("fires approve when the Confirm button is clicked", () => {
    const approve = vi.fn();
    const cancel = vi.fn();
    const { getByText } = render(
      <PilotConfirmModal
        open
        name="remove_todo"
        description="Remove it."
        input={{ id: "t1" }}
        approve={approve}
        cancel={cancel}
      />,
    );
    fireEvent.click(getByText("Confirm"));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("fires cancel when the Cancel button is clicked", () => {
    const approve = vi.fn();
    const cancel = vi.fn();
    const { getByText } = render(
      <PilotConfirmModal
        open
        name="remove_todo"
        description="Remove it."
        input={{ id: "t1" }}
        approve={approve}
        cancel={cancel}
      />,
    );
    fireEvent.click(getByText("Cancel"));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
  });

  it("cancels when the backdrop is clicked", () => {
    const approve = vi.fn();
    const cancel = vi.fn();
    const { container } = render(
      <PilotConfirmModal
        open
        name="remove_todo"
        description="Remove it."
        input={{ id: "t1" }}
        approve={approve}
        cancel={cancel}
      />,
    );
    const backdrop = container.ownerDocument.querySelector(".pilot-confirm-backdrop");
    expect(backdrop).not.toBeNull();
    // Bubble-style click on backdrop itself (target === currentTarget).
    fireEvent.click(backdrop as Element);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
  });

  it("cancels on Escape and approves on Enter", () => {
    const approve = vi.fn();
    const cancel = vi.fn();
    render(
      <PilotConfirmModal
        open
        name="remove_todo"
        description="Remove it."
        input={{ id: "t1" }}
        approve={approve}
        cancel={cancel}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(cancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("omits the Arguments block when the input payload is empty", () => {
    const noop = () => {};
    const { container } = render(
      <PilotConfirmModal
        open
        name="submit_detail"
        description="Submit the form."
        input={{}}
        approve={noop}
        cancel={noop}
      />,
    );
    expect(container.ownerDocument.querySelector(".pilot-confirm-args")).toBeNull();
  });

  it("renders nothing when `open` is false", () => {
    const noop = () => {};
    const { container } = render(
      <PilotConfirmModal
        open={false}
        name="remove_todo"
        description="x"
        input={{ id: "t1" }}
        approve={noop}
        cancel={noop}
      />,
    );
    expect(container.ownerDocument.querySelector(".pilot-confirm-card")).toBeNull();
  });
});
