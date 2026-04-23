// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FileIcon } from "./FileIcon";
import type { FileKind } from "@/lib/fileKind";

const KINDS: FileKind[] = [
  "video", "audio", "image", "document", "code",
  "archive", "executable", "disk-image", "font", "data", "other",
];

describe("FileIcon", () => {
  it.each(KINDS)("renders an svg for kind=%s with an aria-label", (kind) => {
    const { container, getByLabelText } = render(<FileIcon kind={kind} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(getByLabelText(new RegExp(kind.replace("-", ".?")))).toBeInTheDocument();
  });

  it("honors the size prop", () => {
    const { container } = render(<FileIcon kind="video" size={48} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
  });
});
