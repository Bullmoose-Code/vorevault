// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderPickerModal } from "./FolderPickerModal";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

function mockTree() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      folders: [
        { id: "r1", name: ".ryan", parent_id: null },
        { id: "r1-a", name: "clips", parent_id: "r1" },
        { id: "r1-b", name: "screenshots", parent_id: "r1" },
        { id: "r2", name: "shared", parent_id: null },
      ],
    }),
  });
}

describe("FolderPickerModal", () => {
  it("drill-down: shows top-level folders at Home, tapping drills in", async () => {
    mockTree();
    render(
      <FolderPickerModal
        initialFolderId={null}
        onCancel={() => {}}
        onSelect={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    expect(screen.getByText("shared")).toBeInTheDocument();

    await userEvent.click(screen.getByText(".ryan"));
    expect(screen.getByText("clips")).toBeInTheDocument();
    expect(screen.getByText("screenshots")).toBeInTheDocument();
    expect(screen.queryByText("shared")).not.toBeInTheDocument();
  });

  it("breadcrumb: tapping Home returns to root level", async () => {
    mockTree();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByText(".ryan"));
    await userEvent.click(screen.getByRole("button", { name: /home/i }));
    expect(screen.getByText("shared")).toBeInTheDocument();
  });

  it("Select fires onSelect with current level's folder id", async () => {
    mockTree();
    const onSelect = vi.fn();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={onSelect} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByText(".ryan"));
    await userEvent.click(screen.getByRole("button", { name: /^select$/i }));
    expect(onSelect).toHaveBeenCalledWith("r1");
  });

  it("Select from Home fires onSelect(null)", async () => {
    mockTree();
    const onSelect = vi.fn();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={onSelect} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^select$/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("Cancel fires onCancel without selecting", async () => {
    mockTree();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={onCancel} onSelect={onSelect} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("inline create: on 201, new folder appears and becomes current level", async () => {
    mockTree();
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: "new1", name: "fresh" }),
    });
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /create folder here/i }));
    const input = await screen.findByLabelText(/new folder name/i);
    await userEvent.type(input, "fresh{Enter}");
    await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());
    expect(screen.queryByText(".ryan")).not.toBeInTheDocument();
  });

  it("inline create 409: surfaces 'use existing' action", async () => {
    mockTree();
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: "conflict", existingId: "r2" }),
    });
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /create folder here/i }));
    await userEvent.type(screen.getByLabelText(/new folder name/i), "shared{Enter}");
    await waitFor(() =>
      expect(screen.getByText(/already exists/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /use existing/i })).toBeInTheDocument();
  });
});
