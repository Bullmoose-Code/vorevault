// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StorageBar } from "./StorageBar";

const ORIG_FETCH = global.fetch;

describe("StorageBar", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        used_bytes: 3_000_000_000,
        total_bytes: 11_000_000_000_000,
        used_fraction: 0.000273,
      }),
    });
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
  });

  it("renders the formatted usage string after fetch", async () => {
    render(<StorageBar />);
    await waitFor(() => {
      expect(screen.getByText(/2\.8 GB of 11 TB/)).toBeInTheDocument();
    });
  });

  it("re-fetches on vorevault:upload-done event", async () => {
    render(<StorageBar />);
    // Wait for the initial fetch(es) to settle; React 19 dev mode may run
    // effects twice, so we wait for at least 1 call before dispatching.
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1),
    );
    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    window.dispatchEvent(new CustomEvent("vorevault:upload-done"));
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(
        callsBefore + 1,
      ),
    );
  });
});
