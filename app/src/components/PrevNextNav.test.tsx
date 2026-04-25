// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PrevNextNav } from "./PrevNextNav";

afterEach(() => cleanup());

describe("PrevNextNav", () => {
  it("renders both as anchors with correct hrefs when both neighbors exist", () => {
    render(
      <PrevNextNav
        prev={{ id: "prev-id" }}
        next={{ id: "next-id" }}
        fromQuery="from=folder/abc"
      />
    );
    const prev = screen.getByText("← prev");
    const next = screen.getByText("next →");
    expect(prev.tagName).toBe("A");
    expect(prev).toHaveAttribute("href", "/f/prev-id?from=folder/abc");
    expect(next.tagName).toBe("A");
    expect(next).toHaveAttribute("href", "/f/next-id?from=folder/abc");
  });

  it("renders prev as disabled span when prev is null", () => {
    render(<PrevNextNav prev={null} next={{ id: "n" }} fromQuery="from=recent" />);
    const prev = screen.getByText("← prev");
    expect(prev.tagName).toBe("SPAN");
    expect(prev).toHaveAttribute("aria-disabled", "true");
  });

  it("renders next as disabled span when next is null", () => {
    render(<PrevNextNav prev={{ id: "p" }} next={null} fromQuery="from=recent" />);
    const next = screen.getByText("next →");
    expect(next.tagName).toBe("SPAN");
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  it("renders both as disabled spans when both are null", () => {
    render(<PrevNextNav prev={null} next={null} fromQuery="from=recent" />);
    expect(screen.getByText("← prev").tagName).toBe("SPAN");
    expect(screen.getByText("next →").tagName).toBe("SPAN");
  });

  it("preserves the full fromQuery (with & for tagged context)", () => {
    render(
      <PrevNextNav
        prev={{ id: "p" }}
        next={null}
        fromQuery="from=tagged&tag=tag-uuid"
      />
    );
    expect(screen.getByText("← prev")).toHaveAttribute(
      "href",
      "/f/p?from=tagged&tag=tag-uuid",
    );
  });
});
