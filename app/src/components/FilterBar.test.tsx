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

describe("FilterBar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    spMock = new URLSearchParams("");
  });

  it("updates URL with selected tag", () => {
    render(<FilterBar tags={[{ id: "t1", name: "valheim", file_count: 2 }]} />);
    fireEvent.change(screen.getByLabelText("filter by tag"), { target: { value: "t1" } });
    expect(pushMock).toHaveBeenCalledWith("/?tag=t1");
  });

  it("clear link returns to bare pathname", () => {
    spMock = new URLSearchParams("tag=t1");
    render(<FilterBar tags={[{ id: "t1", name: "valheim", file_count: 2 }]} />);
    fireEvent.click(screen.getByText("clear"));
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("does not show clear link when no filter active", () => {
    render(<FilterBar tags={[]} />);
    expect(screen.queryByText("clear")).toBeNull();
  });
});
