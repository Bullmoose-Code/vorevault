// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readStored, writeStored, applyChoice, cycleChoice, THEME_STORAGE_KEY } from "./theme";

describe("theme helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("readStored", () => {
    it("returns 'system' when no value stored", () => {
      expect(readStored()).toBe("system");
    });

    it("returns stored choice when valid", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      expect(readStored()).toBe("dark");
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      expect(readStored()).toBe("light");
      localStorage.setItem(THEME_STORAGE_KEY, "system");
      expect(readStored()).toBe("system");
    });

    it("returns 'system' on invalid stored value", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "purple");
      expect(readStored()).toBe("system");
    });
  });

  describe("writeStored", () => {
    it("stores 'light' and 'dark' explicitly", () => {
      writeStored("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      writeStored("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    it("removes the key for 'system'", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      writeStored("system");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });
  });

  describe("applyChoice", () => {
    it("sets data-theme=dark on dark choice", () => {
      applyChoice("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("sets data-theme=light on light choice", () => {
      applyChoice("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("removes data-theme on system choice", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      applyChoice("system");
      expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    });
  });

  describe("cycleChoice", () => {
    it("system → light → dark → system", () => {
      expect(cycleChoice("system")).toBe("light");
      expect(cycleChoice("light")).toBe("dark");
      expect(cycleChoice("dark")).toBe("system");
    });
  });
});
