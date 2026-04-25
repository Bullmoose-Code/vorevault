import { describe, it, expect } from "vitest";
import { parseFromParam } from "./neighbors";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const FOLDER = "22222222-2222-4222-8222-222222222222";
const TAG    = "33333333-3333-4333-8333-333333333333";

describe("parseFromParam", () => {
  it("returns null when from is missing", () => {
    expect(parseFromParam(undefined, undefined, VIEWER)).toBeNull();
  });

  it("returns null when from is empty string", () => {
    expect(parseFromParam("", undefined, VIEWER)).toBeNull();
  });

  it("parses from=recent", () => {
    expect(parseFromParam("recent", undefined, VIEWER)).toEqual({ kind: "recent" });
  });

  it("parses from=mine using the viewer's userId", () => {
    expect(parseFromParam("mine", undefined, VIEWER)).toEqual({
      kind: "mine",
      uploaderId: VIEWER,
    });
  });

  it("parses from=starred using the viewer's userId", () => {
    expect(parseFromParam("starred", undefined, VIEWER)).toEqual({
      kind: "starred",
      userId: VIEWER,
    });
  });

  it("parses from=folder/<uuid>", () => {
    expect(parseFromParam(`folder/${FOLDER}`, undefined, VIEWER)).toEqual({
      kind: "folder",
      folderId: FOLDER,
    });
  });

  it("returns null when from=folder/ has no uuid", () => {
    expect(parseFromParam("folder/", undefined, VIEWER)).toBeNull();
  });

  it("returns null when from=folder/<not-a-uuid>", () => {
    expect(parseFromParam("folder/not-a-uuid", undefined, VIEWER)).toBeNull();
  });

  it("parses from=tagged with tag=<uuid>", () => {
    expect(parseFromParam("tagged", TAG, VIEWER)).toEqual({
      kind: "tagged",
      tagId: TAG,
    });
  });

  it("returns null when from=tagged but tag is missing", () => {
    expect(parseFromParam("tagged", undefined, VIEWER)).toBeNull();
  });

  it("returns null when from=tagged but tag is not a uuid", () => {
    expect(parseFromParam("tagged", "not-a-uuid", VIEWER)).toBeNull();
  });

  it("returns null for unknown from values", () => {
    expect(parseFromParam("trash", undefined, VIEWER)).toBeNull();
    expect(parseFromParam("search", undefined, VIEWER)).toBeNull();
    expect(parseFromParam("xyzzy", undefined, VIEWER)).toBeNull();
  });
});
