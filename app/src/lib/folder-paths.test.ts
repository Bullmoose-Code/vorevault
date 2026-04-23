import { describe, it, expect } from "vitest";
import {
  splitRelativeDir,
  normalizePaths,
  InvalidFolderPathError,
} from "./folder-paths";

describe("splitRelativeDir", () => {
  it("splits MyFolder/sub/clip.mp4 into dir + name", () => {
    expect(splitRelativeDir("MyFolder/sub/clip.mp4")).toEqual({
      dir: "MyFolder/sub",
      name: "clip.mp4",
    });
  });

  it("returns empty dir for single-segment path", () => {
    expect(splitRelativeDir("clip.mp4")).toEqual({ dir: "", name: "clip.mp4" });
  });

  it("rejects .. segments", () => {
    expect(() => splitRelativeDir("MyFolder/../evil.mp4")).toThrow(InvalidFolderPathError);
  });
});

describe("normalizePaths", () => {
  it("dedupes and returns depth-sorted list", () => {
    const result = normalizePaths([
      "MyFolder/sub/deep",
      "MyFolder",
      "MyFolder/sub",
      "MyFolder/other",
      "MyFolder/sub", // dup
    ]);
    expect(result).toEqual([
      "MyFolder",
      "MyFolder/other",
      "MyFolder/sub",
      "MyFolder/sub/deep",
    ]);
  });

  it("drops empty strings", () => {
    expect(normalizePaths(["", "A", ""])).toEqual(["A"]);
  });

  it("collapses repeated slashes", () => {
    expect(normalizePaths(["A//B"])).toEqual(["A", "A/B"]);
  });

  it("rejects '.' or '..' segments", () => {
    expect(() => normalizePaths(["A/../B"])).toThrow(InvalidFolderPathError);
    expect(() => normalizePaths(["A/./B"])).toThrow(InvalidFolderPathError);
  });
});
