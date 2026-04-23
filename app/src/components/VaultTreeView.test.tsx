// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { VaultTreeView } from "./VaultTreeView";

afterEach(() => cleanup());

const FIXTURE = [
  { id: "a", name: "stunts", parent_id: null },
  { id: "b", name: "raids",  parent_id: null },
  { id: "c", name: "epic",   parent_id: "a" },
  { id: "d", name: "deep",   parent_id: "c" },
];

describe("VaultTreeView", () => {
  it("renders top-level folders with collapse caret when they have children", () => {
    render(<VaultTreeView nodes={FIXTURE} />);
    expect(screen.getByText("stunts")).toBeInTheDocument();
    expect(screen.getByText("raids")).toBeInTheDocument();
    expect(screen.queryByText("epic")).not.toBeInTheDocument();
  });

  it("expands a node on caret click", () => {
    render(<VaultTreeView nodes={FIXTURE} />);
    fireEvent.click(screen.getByLabelText("expand stunts"));
    expect(screen.getByText("epic")).toBeInTheDocument();
    expect(screen.queryByText("deep")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("expand epic"));
    expect(screen.getByText("deep")).toBeInTheDocument();
  });

  it("renders folder names as links to /d/[id]", () => {
    render(<VaultTreeView nodes={FIXTURE} />);
    expect(screen.getByText("stunts").closest("a")).toHaveAttribute("href", "/d/a");
  });
});
