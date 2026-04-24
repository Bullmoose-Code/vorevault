// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "./FilterBar";

const pushMock = vi.fn();
let spMock = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => spMock,
  usePathname: () => "/",
}));

const TAGS = [
  { id: "t1", name: "valheim", file_count: 12 },
  { id: "t2", name: "minecraft", file_count: 7 },
  { id: "t3", name: "ryan", file_count: 3 },
];

describe("FilterBar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    spMock = new URLSearchParams("");
  });

  it("opens the listbox on focus and shows all tags", () => {
    render(<FilterBar tags={TAGS} />);
    fireEvent.focus(screen.getByLabelText("filter by tag"));
    expect(screen.getByText("#valheim")).toBeTruthy();
    expect(screen.getByText("#minecraft")).toBeTruthy();
    expect(screen.getByText("#ryan")).toBeTruthy();
  });

  it("filters options by substring match on the tag name", () => {
    render(<FilterBar tags={TAGS} />);
    const input = screen.getByLabelText("filter by tag");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "craft" } });
    expect(screen.getByText("#minecraft")).toBeTruthy();
    expect(screen.queryByText("#valheim")).toBeNull();
    expect(screen.queryByText("#ryan")).toBeNull();
  });

  it("clicking an option pushes the tag URL", () => {
    render(<FilterBar tags={TAGS} />);
    fireEvent.focus(screen.getByLabelText("filter by tag"));
    fireEvent.mouseDown(screen.getByText("#valheim"));
    expect(pushMock).toHaveBeenCalledWith("/?tag=t1");
  });

  it("shows an inline 'no matching tags' hint when search has no hits", () => {
    render(<FilterBar tags={TAGS} />);
    const input = screen.getByLabelText("filter by tag");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText(/no matching tags/i)).toBeTruthy();
  });

  it("renders an active-filter chip with × that clears on click", () => {
    spMock = new URLSearchParams("tag=t1");
    render(<FilterBar tags={TAGS} />);
    const chip = screen.getByLabelText("clear filter #valheim");
    expect(chip.textContent).toContain("#valheim");
    fireEvent.click(chip);
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("arrow-down then Enter selects the highlighted option", () => {
    render(<FilterBar tags={TAGS} />);
    const input = screen.getByLabelText("filter by tag");
    fireEvent.focus(input);
    // focus opens at index 0 (valheim). ArrowDown → 1 (minecraft).
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/?tag=t2");
  });

  it("does not render a standalone 'tag' label beside the input", () => {
    render(<FilterBar tags={TAGS} />);
    // The prior implementation rendered a small "tag" meta label — confirm it's gone.
    expect(screen.queryByText(/^tag$/i)).toBeNull();
  });
});
