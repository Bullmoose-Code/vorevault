// @vitest-environment jsdom
import "@/../tests/component-setup";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GlobalDropTarget } from "./GlobalDropTarget";

// Stub the modal — real signature: { initialFolderId, onCancel, onSelect: (id: string|null) => void }
vi.mock("./FolderPickerModal", () => ({
  FolderPickerModal: ({ onSelect, onCancel }: { onSelect: (id: string | null) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onSelect(null)}>pick-root</button>
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}));

const enqueueSpy = vi.fn();
vi.mock("./UploadProgressProvider", () => ({
  useUploadProgress: () => ({ enqueue: enqueueSpy, uploads: [], cancel: vi.fn(), clearCompleted: vi.fn() }),
  UploadProgressProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("GlobalDropTarget", () => {
  beforeEach(() => { enqueueSpy.mockReset(); });

  it("shows scrim on dragenter when dataTransfer carries Files", () => {
    render(<GlobalDropTarget />);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"] } });
      document.dispatchEvent(ev);
    });
    expect(screen.getByTestId("global-drop-scrim")).toBeTruthy();
  });

  it("opens picker on drop and enqueues after folder selection", async () => {
    render(<GlobalDropTarget />);
    const f = new File(["hi"], "hi.txt", { type: "text/plain" });
    act(() => {
      const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"], files: [f] } });
      document.dispatchEvent(ev);
    });
    const pickBtn = await screen.findByText("pick-root");
    act(() => { pickBtn.click(); });
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).toHaveBeenCalledWith(f, null);
  });

  it("ignores drags that don't carry Files", () => {
    render(<GlobalDropTarget />);
    act(() => {
      const ev = new DragEvent("dragenter", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types: ["text/plain"] } });
      document.dispatchEvent(ev);
    });
    expect(screen.queryByTestId("global-drop-scrim")).toBeNull();
  });
});
