// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { PrevNextKeys } from "./PrevNextKeys";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => { pushMock.mockClear(); });
afterEach(() => cleanup());

describe("PrevNextKeys", () => {
  it("ArrowRight navigates to next when next is set", () => {
    render(<PrevNextKeys prev={null} next={{ id: "n-id" }} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(pushMock).toHaveBeenCalledWith("/f/n-id?from=recent");
  });

  it("ArrowLeft navigates to prev when prev is set", () => {
    render(<PrevNextKeys prev={{ id: "p-id" }} next={null} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(pushMock).toHaveBeenCalledWith("/f/p-id?from=recent");
  });

  it("does nothing when corresponding neighbor is null", () => {
    render(<PrevNextKeys prev={null} next={null} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("ignores key when target is an input", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(pushMock).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores key when target is a textarea", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    fireEvent.keyDown(ta, { key: "ArrowRight" });
    expect(pushMock).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it("ignores when a modifier key is held", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("ignores keys other than ArrowLeft / ArrowRight", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("removes its event listener on unmount", () => {
    const { unmount } = render(
      <PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />,
    );
    unmount();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
