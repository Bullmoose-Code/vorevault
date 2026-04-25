// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { ScrollRestorer } from "./ScrollRestorer";

// Mock next/navigation. The mock returns the current values from a module-
// scoped object so individual tests can mutate them and re-render to
// simulate route changes.
const navState: { pathname: string; search: string } = {
  pathname: "/",
  search: "",
};

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useSearchParams: () => ({
    toString: () => navState.search,
  }),
}));

beforeEach(() => {
  navState.pathname = "/";
  navState.search = "";
  sessionStorage.clear();
  // Add a fresh main element to the body before each test.
  const main = document.createElement("main");
  main.id = "vv-main-scroll";
  // Make scrollTop a writable data property so jsdom assignments stick
  // regardless of jsdom version's prototype behavior.
  Object.defineProperty(main, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  document.body.appendChild(main);
});

afterEach(() => {
  cleanup();
  document.getElementById("vv-main-scroll")?.remove();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function flushRaf() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("ScrollRestorer", () => {
  it("on first mount with no saved value, leaves scrollTop at 0", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    main.scrollTop = 0;
    render(<ScrollRestorer />);
    await flushRaf();
    expect(main.scrollTop).toBe(0);
  });

  it("on mount with a saved value for the current URL, restores it after rAF", async () => {
    sessionStorage.setItem("vv:scroll:/?", "500");
    const main = document.getElementById("vv-main-scroll")!;
    main.scrollTop = 0;
    render(<ScrollRestorer />);
    await flushRaf();
    expect(main.scrollTop).toBe(500);
  });

  it("on URL change, saves the OUTGOING URL's scrollTop before applying the new URL's", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    sessionStorage.setItem("vv:scroll:/b?", "200");

    // Mount on URL "/a".
    navState.pathname = "/a";
    navState.search = "";
    const { rerender } = render(<ScrollRestorer />);
    await flushRaf();

    // User scrolls.
    main.scrollTop = 750;

    // Navigate to "/b" by mutating the mock state and re-rendering.
    navState.pathname = "/b";
    navState.search = "";
    rerender(<ScrollRestorer />);
    await flushRaf();

    // Old URL's position was saved.
    expect(sessionStorage.getItem("vv:scroll:/a?")).toBe("750");
    // New URL's saved value was restored.
    expect(main.scrollTop).toBe(200);
  });

  it("on URL change with no saved value for the new URL, resets scrollTop to 0", async () => {
    const main = document.getElementById("vv-main-scroll")!;

    navState.pathname = "/a";
    const { rerender } = render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 600;

    navState.pathname = "/b";
    rerender(<ScrollRestorer />);
    await flushRaf();

    expect(main.scrollTop).toBe(0);
  });

  it("treats search-params change as a URL change (pagination)", async () => {
    const main = document.getElementById("vv-main-scroll")!;

    navState.pathname = "/";
    navState.search = "page=1";
    const { rerender } = render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 400;

    navState.search = "page=2";
    rerender(<ScrollRestorer />);
    await flushRaf();

    expect(sessionStorage.getItem("vv:scroll:/?page=1")).toBe("400");
    expect(main.scrollTop).toBe(0);
  });

  it("does nothing when the .main element is missing", async () => {
    document.getElementById("vv-main-scroll")?.remove();
    sessionStorage.setItem("vv:scroll:/?", "500");
    expect(() => render(<ScrollRestorer />)).not.toThrow();
    await flushRaf();
    // No errors logged.
  });

  it("swallows sessionStorage.setItem errors on cleanup", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 100;

    // Stub setItem to throw.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => cleanup()).not.toThrow();
    setItemSpy.mockRestore();
  });

  it("swallows sessionStorage.getItem errors on effect", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    main.scrollTop = 0;

    // Stub getItem to throw.
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => render(<ScrollRestorer />)).not.toThrow();
    await flushRaf();
    expect(main.scrollTop).toBe(0); // falls back to reset
    getItemSpy.mockRestore();
  });

  it("on unmount, saves the current scrollTop", async () => {
    const main = document.getElementById("vv-main-scroll")!;

    navState.pathname = "/keep";
    const { unmount } = render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 333;

    unmount();
    expect(sessionStorage.getItem("vv:scroll:/keep?")).toBe("333");
  });
});
