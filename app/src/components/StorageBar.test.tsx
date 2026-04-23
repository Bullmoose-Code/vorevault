// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
    cleanup(); // ensure React trees are unmounted and window listeners removed before next test
    global.fetch = ORIG_FETCH;
  });

  it("renders the formatted usage string after fetch", async () => {
    const { container } = render(<StorageBar />);
    await waitFor(() => {
      const wrap = container.querySelector('[aria-label="storage usage"]');
      // 3_000_000_000 bytes / 1024^3 ≈ 2.8 GB; 11_000_000_000_000 bytes / 1024^4 ≈ 10.0 TB (binary)
      expect(wrap?.textContent).toMatch(/2\.8 GB of 10\.0 TB/);
    });
  });

  it("re-fetches on vorevault:upload-done event", async () => {
    render(<StorageBar />);
    // Wait for the initial fetch to settle. reactStrictMode:true is a Next.js browser
    // setting; vitest/jsdom does not double-invoke effects, so exactly 1 call happens here.
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1),
    );
    window.dispatchEvent(new CustomEvent("vorevault:upload-done"));
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2),
    );
  });
});
