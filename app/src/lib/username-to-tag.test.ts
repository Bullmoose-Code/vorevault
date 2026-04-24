import { describe, it, expect } from "vitest";
import { usernameToTag } from "./username-to-tag";

describe("usernameToTag", () => {
  it("passes through plain lowercase", () => {
    expect(usernameToTag("alex")).toBe("alex");
  });
  it("lowercases uppercase", () => {
    expect(usernameToTag("Alex")).toBe("alex");
  });
  it("replaces . and _ with -", () => {
    expect(usernameToTag("ryan.vander_17")).toBe("ryan-vander-17");
  });
  it("collapses runs of dashes", () => {
    expect(usernameToTag("hello___world")).toBe("hello-world");
  });
  it("trims leading and trailing dashes", () => {
    expect(usernameToTag("_alex_")).toBe("alex");
    expect(usernameToTag("---alex---")).toBe("alex");
  });
  it("caps at 32 chars", () => {
    const name = "a".repeat(40);
    expect(usernameToTag(name)).toBe("a".repeat(32));
  });
  it("returns null when result is empty", () => {
    expect(usernameToTag("___")).toBeNull();
    expect(usernameToTag("")).toBeNull();
    expect(usernameToTag("!@#")).toBeNull();
  });
  it("handles leading dashes that survive the scrub step", () => {
    // Leading '-' would be produced by the raw regex replace. The helper should
    // strip leading '-' so the result is a valid tag name.
    expect(usernameToTag("-".repeat(40) + "a")).toBe("a");
  });
});
