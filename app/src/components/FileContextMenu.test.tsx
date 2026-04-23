// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileContextMenu } from "./FileContextMenu";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";
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
      <ItemActionProvider>
        <FileContextMenu file={file}>
          <div data-testid="target">child</div>
        </FileContextMenu>
      </ItemActionProvider>
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
});
