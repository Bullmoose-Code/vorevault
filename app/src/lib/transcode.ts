import ffmpeg from "fluent-ffmpeg";
import { getNextPendingTranscode, updateTranscodeStatus } from "@/lib/files";
import { ensureDir, TRANSCODED_DIR } from "@/lib/storage";

const WEB_VIDEO_CODECS = new Set(["h264"]);
const WEB_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis"]);
const WEB_CONTAINERS = new Set(["mov,mp4,m4a,3gp,3g2,mj2", "mp4"]);

type StreamInfo = { codec_type: string; codec_name: string };

export function isWebFriendly(streams: StreamInfo[], formatName: string): boolean {
  if (!WEB_CONTAINERS.has(formatName)) return false;
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video || !WEB_VIDEO_CODECS.has(video.codec_name)) return false;
  if (audio && !WEB_AUDIO_CODECS.has(audio.codec_name)) return false;
  return true;
}

function probe(filePath: string): Promise<{ streams: StreamInfo[]; formatName: string }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve({
        streams: data.streams.map((s) => ({
          codec_type: s.codec_type ?? "",
          codec_name: s.codec_name ?? "",
        })),
        formatName: data.format.format_name ?? "",
      });
    });
  });
}

function transcode(srcPath: string, dstPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-preset", "medium",
        "-crf", "23",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
      ])
      .output(dstPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function processNextPending(): Promise<boolean> {
  const file = await getNextPendingTranscode();
  if (!file) return false;

  try {
    const { streams, formatName } = await probe(file.storage_path);

    if (isWebFriendly(streams, formatName)) {
      await updateTranscodeStatus(file.id, "skipped", file.storage_path);
      console.log(`transcode: skipped ${file.id} (already web-friendly)`);
      return true;
    }

    const dstPath = `${TRANSCODED_DIR}/${file.id}.mp4`;
    await ensureDir(TRANSCODED_DIR);
    console.log(`transcode: starting ${file.id} → ${dstPath}`);
    await transcode(file.storage_path, dstPath);
    await updateTranscodeStatus(file.id, "done", dstPath);
    console.log(`transcode: done ${file.id}`);
  } catch (err) {
    console.error(`transcode: failed ${file.id}:`, err);
    await updateTranscodeStatus(file.id, "failed", null);
  }

  return true;
}

const POLL_INTERVAL_MS = 30_000;
let running = false;

export function startTranscodeWorker(): void {
  if (running) return;
  running = true;
  console.log("transcode worker: started (polling every 30s)");

  async function poll() {
    try {
      let processed = true;
      while (processed) {
        processed = await processNextPending();
      }
    } catch (err) {
      console.error("transcode worker poll error:", err);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  }

  poll();
}
