// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagChip } from "./TagChip";

describe("TagChip", () => {
  it("renders the name prefixed with #", () => {
    render(<TagChip name="valheim" />);
    expect(screen.getByText("#valheim")).toBeTruthy();
  });
  it("wraps label in Link when href is provided", () => {
    render(<TagChip name="valheim" href="/?tag=abc" />);
    const anchor = screen.getByText("#valheim").closest("a");
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("href")).toBe("/?tag=abc");
  });
  it("renders remove button when onRemove is provided", () => {
    const onRemove = vi.fn();
    render(<TagChip name="valheim" onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("remove tag valheim"));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
