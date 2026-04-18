// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewFolderDialog } from "./NewFolderDialog";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("NewFolderDialog", () => {
  it("posts to /api/folders with correct parentId on Create click", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: "folder-1", name: "clips" }),
    });
    const onCreated = vi.fn();
    render(
      <NewFolderDialog
        open
        onClose={() => {}}
        parentId="p1"
        parentName="home"
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "clips");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/folders", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "clips", parentId: "p1" }),
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "folder-1", name: "clips" });
  });

  it("submits on Enter in the input", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: "f", name: "x" }),
    });
    const onCreated = vi.fn();
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId={null} parentName={null}
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "x{Enter}");
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("titles 'New folder in root' when parent is null", () => {
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId={null} parentName={null}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /new folder in root/i })).toBeInTheDocument();
  });

  it("titles 'New folder in <name>' when parent provided", () => {
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId="p" parentName=".ryan"
        onCreated={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /new folder in \.ryan/i })).toBeInTheDocument();
  });

  it("surfaces 409 conflict inline and stays open", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: "conflict", existingId: "abc" }),
    });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <NewFolderDialog
        open onClose={onClose} parentId="p1" parentName="home"
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "dup");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(screen.getByText(/already exists/i)).toBeInTheDocument(),
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables Create while request is in flight and re-enables after error", async () => {
    let resolveFn!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => { resolveFn = resolve; }),
    );
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId={null} parentName={null}
        onCreated={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "x");
    const createBtn = screen.getByRole("button", { name: /create/i });
    await userEvent.click(createBtn);
    expect(createBtn).toBeDisabled();
    resolveFn({
      ok: false, status: 500,
      json: async () => ({ error: "oops" }),
    });
    await waitFor(() => expect(createBtn).not.toBeDisabled());
  });
});
