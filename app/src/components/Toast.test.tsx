// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Toast, type ToastItem } from "./Toast";

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders each toast's message with a role=status", () => {
    const items: ToastItem[] = [
      { id: "1", message: "hi", variant: "info" },
      { id: "2", message: "done", variant: "success" },
    ];
    render(<Toast items={items} onDismiss={() => {}} />);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("calls onDismiss after ~3s per toast", () => {
    const onDismiss = vi.fn();
    const items: ToastItem[] = [{ id: "1", message: "hi", variant: "info" }];
    render(<Toast items={items} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(3100); });
    expect(onDismiss).toHaveBeenCalledWith("1");
  });

  it("per-toast timer is NOT reset when new toasts arrive", () => {
    const onDismiss = vi.fn();
    const first: ToastItem[] = [{ id: "1", message: "first", variant: "info" }];
    const both: ToastItem[] = [
      { id: "1", message: "first", variant: "info" },
      { id: "2", message: "second", variant: "info" },
    ];
    const { rerender } = render(<Toast items={first} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(1000); });
    // Second toast arrives 1s in
    rerender(<Toast items={both} onDismiss={onDismiss} />);
    // Advance another 2100ms — first toast should have dismissed at ~3s mark
    act(() => { vi.advanceTimersByTime(2100); });
    expect(onDismiss).toHaveBeenCalledWith("1");
  });
});
