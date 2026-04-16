import { describe, it, expect, vi, beforeEach } from "vitest";

const getNextPendingTranscode = vi.fn();
const updateTranscodeStatus = vi.fn();
vi.mock("@/lib/files", () => ({
  getNextPendingTranscode: (...a: unknown[]) => getNextPendingTranscode(...a),
  updateTranscodeStatus: (...a: unknown[]) => updateTranscodeStatus(...a),
}));

const ffprobeMock = vi.fn();
vi.mock("fluent-ffmpeg", () => {
  const fn = () => ({});
  fn.ffprobe = (...a: unknown[]) => ffprobeMock(...a);
  return { default: fn };
});

const ensureDirMock = vi.fn();
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, ensureDir: (...a: unknown[]) => ensureDirMock(...a) };
});

beforeEach(() => vi.clearAllMocks());

describe("isWebFriendly", () => {
  it("returns true for h264+aac in mp4", async () => {
    const { isWebFriendly } = await import("./transcode");
    const streams = [
      { codec_type: "video", codec_name: "h264" },
      { codec_type: "audio", codec_name: "aac" },
    ];
    expect(isWebFriendly(streams, "mp4")).toBe(true);
  });

  it("returns false for h265 video", async () => {
    const { isWebFriendly } = await import("./transcode");
    const streams = [
      { codec_type: "video", codec_name: "hevc" },
      { codec_type: "audio", codec_name: "aac" },
    ];
    expect(isWebFriendly(streams, "mp4")).toBe(false);
  });

  it("returns false for non-mp4 container", async () => {
    const { isWebFriendly } = await import("./transcode");
    const streams = [
      { codec_type: "video", codec_name: "h264" },
      { codec_type: "audio", codec_name: "aac" },
    ];
    expect(isWebFriendly(streams, "matroska")).toBe(false);
  });

  it("returns true for video-only h264 mp4 (no audio)", async () => {
    const { isWebFriendly } = await import("./transcode");
    const streams = [{ codec_type: "video", codec_name: "h264" }];
    expect(isWebFriendly(streams, "mp4")).toBe(true);
  });
});

describe("processNextPending", () => {
  it("returns false when no pending files", async () => {
    getNextPendingTranscode.mockResolvedValueOnce(null);
    const { processNextPending } = await import("./transcode");
    expect(await processNextPending()).toBe(false);
  });

  it("marks file as skipped when already web-friendly", async () => {
    getNextPendingTranscode.mockResolvedValueOnce({
      id: "f1", storage_path: "/data/uploads/f1/clip.mp4", mime_type: "video/mp4",
    });
    ffprobeMock.mockImplementationOnce((_path: string, cb: Function) => {
      cb(null, {
        format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
        streams: [
          { codec_type: "video", codec_name: "h264" },
          { codec_type: "audio", codec_name: "aac" },
        ],
      });
    });
    updateTranscodeStatus.mockResolvedValueOnce(undefined);
    const { processNextPending } = await import("./transcode");
    expect(await processNextPending()).toBe(true);
    expect(updateTranscodeStatus).toHaveBeenCalledWith("f1", "skipped", "/data/uploads/f1/clip.mp4");
  });
});
