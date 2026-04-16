import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const THUMB_MAX_DIM = 480;

export type ThumbResult = {
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type ThumbArgs = {
  srcPath: string;
  mimeType: string;
  dstPath: string;
};

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function generateThumbnail(args: ThumbArgs): Promise<ThumbResult | null> {
  await ensureParent(args.dstPath);
  if (args.mimeType.startsWith("image/")) return imageThumb(args);
  if (args.mimeType.startsWith("video/")) return videoThumb(args);
  return null;
}

async function imageThumb(args: ThumbArgs): Promise<ThumbResult> {
  const meta = await sharp(args.srcPath).metadata();
  await sharp(args.srcPath)
    .resize({ width: THUMB_MAX_DIM, height: THUMB_MAX_DIM, fit: "inside" })
    .jpeg({ quality: 80 })
    .toFile(args.dstPath);
  return {
    width: meta.width ?? null,
    height: meta.height ?? null,
    durationSec: null,
  };
}

function videoThumb(args: ThumbArgs): Promise<ThumbResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(args.srcPath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video");
      const duration = data.format.duration ?? 0;
      const seek = Math.min(1, Math.max(0, duration / 2));
      ffmpeg(args.srcPath)
        .seekInput(seek)
        .frames(1)
        .size(`${THUMB_MAX_DIM}x?`)
        .output(args.dstPath)
        .on("end", () => {
          resolve({
            width: stream?.width ?? null,
            height: stream?.height ?? null,
            durationSec: Math.round(duration),
          });
        })
        .on("error", reject)
        .run();
    });
  });
}
