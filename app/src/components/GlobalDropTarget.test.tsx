// @vitest-environment jsdom
import "@/../tests/component-setup";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { GlobalDropTarget } from "./GlobalDropTarget";

vi.mock("./Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="modal-open">{children}</div> : null,
}));

const pickerProps = { initialFolderId: null as string | null };
vi.mock("./FolderPickerModal", () => ({
  FolderPickerModal: ({ initialFolderId, onSelect, onCancel }: { initialFolderId: string | null; onSelect: (id: string | null) => void; onCancel: () => void }) => {
    pickerProps.initialFolderId = initialFolderId;
    return (
      <div>
        <button onClick={() => onSelect(null)}>pick-root</button>
        <button onClick={() => onSelect("dest-folder-id")}>pick-dest</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    );
  },
}));

const enqueueSpy = vi.fn();
vi.mock("./UploadProgressProvider", () => ({
  useUploadProgress: () => ({ enqueue: enqueueSpy, uploads: [], cancel: vi.fn(), clearCompleted: vi.fn() }),
  UploadProgressProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("GlobalDropTarget", () => {
  beforeEach(() => {
    enqueueSpy.mockReset();
    pickerProps.initialFolderId = null;
  });

  it("shows scrim on dragenter when dataTransfer carries Files", () => {
    render(<GlobalDropTarget currentFolderId={null} />);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"] } });
      document.dispatchEvent(ev);
    });
    expect(screen.getByTestId("global-drop-scrim")).toBeTruthy();
  });

  it("opens picker on drop and enqueues after folder selection", async () => {
    render(<GlobalDropTarget currentFolderId={null} />);
    const f = new File(["hi"], "hi.txt", { type: "text/plain" });
    act(() => {
      const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"], files: [f], items: [] } });
      document.dispatchEvent(ev);
    });
    const pickBtn = await screen.findByText("pick-root");
    await act(async () => { pickBtn.click(); });
    await waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1));
    expect(enqueueSpy).toHaveBeenCalledWith(f, null);
  });

  it("passes currentFolderId as initialFolderId to the picker", async () => {
    render(<GlobalDropTarget currentFolderId="current-folder-id" />);
    const f = new File(["hi"], "hi.txt", { type: "text/plain" });
    act(() => {
      const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"], files: [f], items: [] } });
      document.dispatchEvent(ev);
    });
    await screen.findByText("pick-root");
    expect(pickerProps.initialFolderId).toBe("current-folder-id");
  });

  it("enqueues with selected destination folder", async () => {
    render(<GlobalDropTarget currentFolderId={null} />);
    const f = new File(["hi"], "hi.txt", { type: "text/plain" });
    act(() => {
      const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"], files: [f], items: [] } });
      document.dispatchEvent(ev);
    });
    const pickBtn = await screen.findByText("pick-dest");
    await act(async () => { pickBtn.click(); });
    await waitFor(() => expect(enqueueSpy).toHaveBeenCalledWith(f, "dest-folder-id"));
  });

  it("ignores drags that don't carry Files", () => {
    render(<GlobalDropTarget currentFolderId={null} />);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["text/plain"] } });
      document.dispatchEvent(ev);
    });
    expect(screen.queryByTestId("global-drop-scrim")).toBeNull();
  });

  it("ignores internal vorevault drags (e.g. moving a file card)", () => {
    render(<GlobalDropTarget currentFolderId={null} />);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", {
        value: { types: ["Files", "application/x-vorevault-drag"] },
      });
      document.dispatchEvent(ev);
    });
    expect(screen.queryByTestId("global-drop-scrim")).toBeNull();
  });

  it("does not enqueue if a drop is internal vorevault drag", async () => {
    render(<GlobalDropTarget currentFolderId={null} />);
    const f = new File(["hi"], "hi.txt", { type: "text/plain" });
    act(() => {
      const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", {
        value: { types: ["Files", "application/x-vorevault-drag"], files: [f], items: [] },
      });
      document.dispatchEvent(ev);
    });
    // Give async onDrop a turn to settle even though it early-returns.
    await new Promise((r) => setTimeout(r, 0));
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
