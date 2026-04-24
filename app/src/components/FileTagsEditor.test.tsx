// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileTagsEditor } from "./FileTagsEditor";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("FileTagsEditor", () => {
  it("adds a tag via POST and renders it", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ tag: { id: "t1", name: "valheim", created_at: "2026-01-01" } }),
    } as Response);
    render(<FileTagsEditor fileId="f1" initialTags={[]} />);
    fireEvent.change(screen.getByPlaceholderText("add tag…"), { target: { value: "Valheim" } });
    fireEvent.click(screen.getByText("add"));
    await waitFor(() => expect(screen.getByText("#valheim")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/files/f1/tags", expect.objectContaining({ method: "POST" }));
  });

  it("removes a tag via DELETE", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response);
    render(<FileTagsEditor fileId="f1" initialTags={[{ id: "t1", name: "valheim" }]} />);
    fireEvent.click(screen.getByLabelText("remove tag valheim"));
    await waitFor(() => expect(screen.queryByText("#valheim")).toBeNull());
  });

  it("shows inline error on invalid tag", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({ error: "invalid tag name", reason: "tag names must be lowercase…" }),
    } as Response);
    render(<FileTagsEditor fileId="f1" initialTags={[]} />);
    fireEvent.change(screen.getByPlaceholderText("add tag…"), { target: { value: "Hello World" } });
    fireEvent.click(screen.getByText("add"));
    await waitFor(() => expect(screen.getByText(/lowercase/i)).toBeTruthy());
  });
});
