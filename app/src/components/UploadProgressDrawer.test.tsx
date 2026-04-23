// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { UploadProgressDrawer } from "./UploadProgressDrawer";
import * as providerModule from "./UploadProgressProvider";

const baseCtx = {
  enqueue: vi.fn(),
  cancel: vi.fn(),
  clearCompleted: vi.fn(),
};

function stubCtx(uploads: providerModule.ActiveUpload[]) {
  vi.spyOn(providerModule, "useUploadProgress").mockReturnValue({
    uploads, ...baseCtx,
  });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("UploadProgressDrawer", () => {
  it("renders nothing when there are no uploads", () => {
    stubCtx([]);
    const { container } = render(<UploadProgressDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a row per upload with status and percentage", () => {
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 42, status: "uploading" },
      { id: "b", folderId: null, startedAt: 0, name: "photo.png", size: 200, uploaded: 200, status: "done" },
    ]);
    render(<UploadProgressDrawer />);
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it("cancel button calls ctx.cancel for the row id", () => {
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 10, status: "uploading" },
    ]);
    render(<UploadProgressDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /cancel clip\.mp4/i }));
    expect(baseCtx.cancel).toHaveBeenCalledWith("a");
  });

  it("header pill collapses the drawer", () => {
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 10, status: "uploading" },
    ]);
    render(<UploadProgressDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /uploads|uploading/i }));
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
  });

  it("auto-collapses 5s after every row is settled", () => {
    vi.useFakeTimers();
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 100, status: "done" },
    ]);
    render(<UploadProgressDrawer />);
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
  });
});
