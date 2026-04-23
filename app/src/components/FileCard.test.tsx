// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileCard } from "./FileCard";
import type { FileWithUploader } from "@/lib/files";

function makeFile(overrides: Partial<FileWithUploader> = {}): FileWithUploader {
  const base: FileWithUploader = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    uploader_id: "u1",
    uploader_name: "alice",
    original_name: "thing.mp4",
    mime_type: "video/mp4",
    size_bytes: 1024 * 1024,
    storage_path: "/data/uploads/aaa",
    transcoded_path: null,
    thumbnail_path: "/data/thumbs/aaa.jpg",
    transcode_status: "done",
    duration_sec: 125,
    width: 1920,
    height: 1080,
    folder_id: null,
    created_at: new Date(Date.now() - 60_000) as unknown as Date,
    deleted_at: null,
  };
  return { ...base, ...overrides };
}

describe("FileCard", () => {
  it("video with thumbnail: renders thumbnail img, duration badge, uppercased label", () => {
    render(<FileCard file={makeFile()} />);
    const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
    expect(img.src).toContain("/api/thumbs/");
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("MP4")).toBeInTheDocument();
  });

  it("image file without thumbnail: renders icon tile with PNG label, no duration", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "pic.png",
          mime_type: "image/png",
          thumbnail_path: null,
          duration_sec: null,
        })}
      />
    );
    expect(screen.getByLabelText(/image.?file/)).toBeInTheDocument();
    expect(screen.getByText("PNG")).toBeInTheDocument();
    expect(screen.queryByText(/:\d\d/)).not.toBeInTheDocument();
  });

  it("iso file: renders disk-image icon tile with ISO label", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "ubuntu.iso",
          mime_type: "application/octet-stream",
          thumbnail_path: null,
          duration_sec: null,
        })}
      />
    );
    expect(screen.getByLabelText(/disk.?image.?file/)).toBeInTheDocument();
    expect(screen.getByText("ISO")).toBeInTheDocument();
  });

  it("readme.md: renders document icon tile with MD label", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "README.md",
          mime_type: "text/markdown",
          thumbnail_path: null,
          duration_sec: null,
        })}
      />
    );
    expect(screen.getByLabelText(/document.?file/)).toBeInTheDocument();
    expect(screen.getByText("MD")).toBeInTheDocument();
  });

  it("audio without thumbnail: renders audio icon tile with duration", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "song.mp3",
          mime_type: "audio/mpeg",
          thumbnail_path: null,
          duration_sec: 200,
        })}
      />
    );
    expect(screen.getByLabelText(/audio.?file/)).toBeInTheDocument();
    expect(screen.getByText("MP3")).toBeInTheDocument();
    expect(screen.getByText("3:20")).toBeInTheDocument();
  });

  it("non-video/audio never shows a duration badge even if duration_sec is set", () => {
    render(
      <FileCard
        file={makeFile({
          original_name: "weird.zip",
          mime_type: "application/zip",
          thumbnail_path: null,
          duration_sec: 99,
        })}
      />
    );
    expect(screen.queryByText(/\d+:\d\d/)).not.toBeInTheDocument();
  });

  it("card links to /f/:id", () => {
    const file = makeFile({ id: "abc-123" });
    render(<FileCard file={file} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/f/abc-123");
  });
});
