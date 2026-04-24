import { describe, it, expect } from "vitest";
import { isPreviewableTextMime } from "./text-preview";

describe("isPreviewableTextMime", () => {
  it("allows common text mimes", () => {
    expect(isPreviewableTextMime("text/plain")).toBe(true);
    expect(isPreviewableTextMime("text/markdown")).toBe(true);
    expect(isPreviewableTextMime("text/csv")).toBe(true);
    expect(isPreviewableTextMime("application/json")).toBe(true);
    expect(isPreviewableTextMime("application/xml")).toBe(true);
    expect(isPreviewableTextMime("application/javascript")).toBe(true);
  });
  it("rejects unsafe and binary mimes", () => {
    expect(isPreviewableTextMime("text/html")).toBe(false);
    expect(isPreviewableTextMime("image/svg+xml")).toBe(false);
    expect(isPreviewableTextMime("application/octet-stream")).toBe(false);
    expect(isPreviewableTextMime("video/mp4")).toBe(false);
    expect(isPreviewableTextMime("")).toBe(false);
  });
});
