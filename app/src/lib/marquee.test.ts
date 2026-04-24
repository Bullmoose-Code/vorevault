import { describe, it, expect } from "vitest";
import { buildMarqueeRect, rectsOverlap } from "./marquee";

describe("buildMarqueeRect", () => {
  it("normalizes drag to the south-east", () => {
    expect(buildMarqueeRect({ x: 10, y: 10 }, { x: 100, y: 100 })).toEqual({
      left: 10, top: 10, right: 100, bottom: 100,
    });
  });

  it("normalizes drag to the north-west", () => {
    expect(buildMarqueeRect({ x: 100, y: 100 }, { x: 10, y: 10 })).toEqual({
      left: 10, top: 10, right: 100, bottom: 100,
    });
  });

  it("normalizes a zero-size drag (click without move)", () => {
    expect(buildMarqueeRect({ x: 50, y: 50 }, { x: 50, y: 50 })).toEqual({
      left: 50, top: 50, right: 50, bottom: 50,
    });
  });
});

describe("rectsOverlap", () => {
  const a = { left: 0, top: 0, right: 100, bottom: 100 };

  it("returns true when rects fully overlap", () => {
    expect(rectsOverlap(a, { left: 20, top: 20, right: 80, bottom: 80 })).toBe(true);
  });

  it("returns true when rects partially overlap", () => {
    expect(rectsOverlap(a, { left: 80, top: 80, right: 200, bottom: 200 })).toBe(true);
  });

  it("returns false when rects are entirely separate (right)", () => {
    expect(rectsOverlap(a, { left: 150, top: 0, right: 250, bottom: 100 })).toBe(false);
  });

  it("returns false when rects are entirely separate (below)", () => {
    expect(rectsOverlap(a, { left: 0, top: 150, right: 100, bottom: 250 })).toBe(false);
  });

  it("returns true when edges touch (inclusive)", () => {
    expect(rectsOverlap(a, { left: 100, top: 0, right: 200, bottom: 100 })).toBe(true);
  });
});
