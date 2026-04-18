// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("does not render children when open=false", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hi">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });

  it("renders children when open=true", () => {
    render(
      <Modal open onClose={() => {}} title="Hi">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Hi" })).toBeInTheDocument();
  });

  it("calls onClose on ESC", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on overlay click", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when sheet body is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>inside</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when close button (×) is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores on close", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Hi">
        <p>x</p>
      </Modal>,
    );
    expect(document.documentElement.style.overflow).toBe("hidden");
    rerender(
      <Modal open={false} onClose={() => {}} title="Hi">
        <p>x</p>
      </Modal>,
    );
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("moves focus into the sheet on open and restores to trigger on close", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>trigger</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Hi">
            <button>inside-button</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    await userEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });
});
