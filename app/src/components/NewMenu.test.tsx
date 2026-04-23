// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewMenu } from "./NewMenu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const enqueue = vi.fn();
vi.mock("./UploadProgressProvider", () => ({
  useUploadProgress: () => ({ enqueue, cancel: vi.fn(), clearCompleted: vi.fn(), uploads: [] }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  enqueue.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mockTree() {
  // First fetch call → FolderPickerModal's GET /api/folders/tree.
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ folders: [{ id: "root-1", name: "clips", parent_id: null }] }),
  });
}

describe("NewMenu", () => {
  it("renders the + new button closed by default", () => {
    render(<NewMenu currentFolderId={null} />);
    expect(screen.getByRole("button", { name: /\+ new/ })).toBeInTheDocument();
    expect(screen.queryByText("new folder")).not.toBeInTheDocument();
  });

  it("opens the menu and shows three items", () => {
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    expect(screen.getByText("new folder")).toBeInTheDocument();
    expect(screen.getByText("upload file")).toBeInTheDocument();
    expect(screen.getByText("upload folder")).toBeInTheDocument();
  });

  it("upload file opens the folder picker", async () => {
    mockTree();
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    fireEvent.click(screen.getByText("upload file"));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /choose folder/i })).toBeInTheDocument(),
    );
  });

  it("folder picker Select + file pick enqueues uploads at the chosen folder", async () => {
    mockTree();
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    fireEvent.click(screen.getByText("upload file"));
    await waitFor(() => screen.getByRole("dialog", { name: /choose folder/i }));
    fireEvent.click(screen.getByText("clips"));
    fireEvent.click(screen.getByRole("button", { name: /^select$/i }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]:not([webkitdirectory])');
    expect(fileInput).toBeTruthy();
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await act(async () => {
      Object.defineProperty(fileInput!, "files", {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput!);
    });

    expect(enqueue).toHaveBeenCalledWith(file, "root-1");
  });

  it("upload folder POSTs the tree then enqueues with mapped folder ids", async () => {
    mockTree(); // folder picker GET
    // createFolderTree POST response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ folders: { "Album": "new-root", "Album/sub": "new-sub" } }),
    });

    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    fireEvent.click(screen.getByText("upload folder"));
    await waitFor(() => screen.getByRole("dialog", { name: /choose folder/i }));
    fireEvent.click(screen.getByRole("button", { name: /^select$/i })); // Home

    const dirInput = document.querySelector<HTMLInputElement>('input[webkitdirectory]');
    expect(dirInput).toBeTruthy();

    const file1 = new File(["x"], "a.mp4", { type: "video/mp4" });
    Object.defineProperty(file1, "webkitRelativePath", { value: "Album/a.mp4" });
    const file2 = new File(["y"], "b.mp4", { type: "video/mp4" });
    Object.defineProperty(file2, "webkitRelativePath", { value: "Album/sub/b.mp4" });

    await act(async () => {
      Object.defineProperty(dirInput!, "files", { value: [file1, file2], configurable: true });
      fireEvent.change(dirInput!);
    });

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    expect(enqueue).toHaveBeenCalledWith(file1, "new-root");
    expect(enqueue).toHaveBeenCalledWith(file2, "new-sub");
  });
});
