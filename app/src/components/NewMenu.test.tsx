// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NewMenu } from "./NewMenu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => cleanup());

describe("NewMenu", () => {
  it("renders the + new button closed by default", () => {
    render(<NewMenu currentFolderId={null} />);
    expect(screen.getByRole("button", { name: /\+ new/ })).toBeInTheDocument();
    expect(screen.queryByText("new folder")).not.toBeInTheDocument();
  });

  it("opens the menu on click and shows new-folder + upload-file", () => {
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    expect(screen.getByText("new folder")).toBeInTheDocument();
    expect(screen.getByText("upload file")).toBeInTheDocument();
  });

  it("upload file is a link to /upload", () => {
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    expect(screen.getByText("upload file").closest("a")).toHaveAttribute("href", "/upload");
  });
});
