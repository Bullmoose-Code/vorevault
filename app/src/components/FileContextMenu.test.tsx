// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileContextMenu } from "./FileContextMenu";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";
import type { FileWithUploader } from "@/lib/files";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function makeFile(overrides: Partial<FileWithUploader> = {}): FileWithUploader {
  return {
    id: "f-1",
    uploader_id: "u-owner",
    uploader_name: "alice",
    original_name: "a.mp4",
    mime_type: "video/mp4",
    size_bytes: 100,
    storage_path: "x",
    transcoded_path: null,
    thumbnail_path: null,
    transcode_status: "done",
    duration_sec: 10,
    width: null,
    height: null,
    folder_id: null,
    created_at: new Date() as unknown as Date,
    deleted_at: null,
    ...overrides,
  };
}

function wrap(file: FileWithUploader, user: { id: string; isAdmin: boolean }) {
  return render(
    <CurrentUserProvider value={user}>
      <SelectionProvider>
        <ItemActionProvider>
          <FileContextMenu file={file}>
            <div data-testid="target">child</div>
          </FileContextMenu>
        </ItemActionProvider>
      </SelectionProvider>
    </CurrentUserProvider>,
  );
}

describe("FileContextMenu", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://x" }) }));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("right-click as owner shows all actions", async () => {
    wrap(makeFile(), { id: "u-owner", isAdmin: false });
    const target = screen.getByTestId("target");
    fireEvent.contextMenu(target);
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(/^download$/i)).toBeInTheDocument();
    expect(screen.getByText(/copy public link/i)).toBeInTheDocument();
    expect(screen.getByText(/^rename$/i)).toBeInTheDocument();
    expect(screen.getByText(/^move to…$/i)).toBeInTheDocument();
    expect(screen.getByText(/move to trash/i)).toBeInTheDocument();
  });

  it("right-click as non-owner hides Rename/Move/Trash", async () => {
    wrap(makeFile(), { id: "u-stranger", isAdmin: false });
    const target = screen.getByTestId("target");
    fireEvent.contextMenu(target);
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^move to…$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/move to trash/i)).not.toBeInTheDocument();
  });

  it("right-click as admin shows all actions even if not uploader", async () => {
    wrap(makeFile(), { id: "u-admin", isAdmin: true });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^rename$/i)).toBeInTheDocument();
  });

  it("batch mode: right-click a selected file when selection > 1 shows only batch actions", async () => {
    const file = makeFile({ id: "f-1" });
    function Seed() {
      const sel = useSelection();
      if (sel.size === 0) {
        sel.toggle({ kind: "file", id: file.id, name: file.original_name, canManage: true, folderId: null });
        sel.toggle({ kind: "file", id: "other", name: "other.mp4", canManage: true, folderId: null });
      }
      return null;
    }
    render(
      <CurrentUserProvider value={{ id: "u-owner", isAdmin: false }}>
        <SelectionProvider>
          <ItemActionProvider>
            <Seed />
            <FileContextMenu file={file}>
              <div data-testid="target">t</div>
            </FileContextMenu>
          </ItemActionProvider>
        </SelectionProvider>
      </CurrentUserProvider>,
    );
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/download as zip/i)).toBeInTheDocument();
    expect(screen.getByText(/^move to…$/i)).toBeInTheDocument();
    expect(screen.getByText(/move to trash/i)).toBeInTheDocument();
    expect(screen.queryByText(/^open$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/copy public link/i)).not.toBeInTheDocument();
  });
});
