import { notFound } from "next/navigation";
import { getShareLink } from "@/lib/share-links";
import { getFile } from "@/lib/files";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = { params: Promise<{ token: string }> };

export default async function PublicViewPage({ params }: Props) {
  const { token } = await params;
  const link = await getShareLink(token);
  if (!link) notFound();

  const file = await getFile(link.file_id);
  if (!file) notFound();

  const streamUrl = `/api/public/${token}`;
  const isVideo = file.mime_type.startsWith("video/");
  const isAudio = file.mime_type.startsWith("audio/");
  const isImage = file.mime_type.startsWith("image/");

  return (
    <main className={styles.page}>
      {isVideo && (
        <video
          controls
          playsInline
          preload="metadata"
          src={streamUrl}
          className={styles.player}
        />
      )}
      {isAudio && <audio controls preload="metadata" src={streamUrl} className={styles.audio} />}
      {isImage && <img src={streamUrl} alt={file.original_name} className={styles.image} />}
      {!isVideo && !isAudio && !isImage && (
        <div className={styles.noPreview}>
          No preview available for <code>{file.mime_type}</code>
        </div>
      )}

      <h1 className={`vv-title ${styles.title}`}>{file.original_name}</h1>
      <p className={`vv-meta ${styles.meta}`}>
        {file.mime_type} · <strong>{formatBytes(file.size_bytes)}</strong>
        {file.duration_sec != null && <> · <strong>{formatDuration(file.duration_sec)}</strong></>}
      </p>

      <a href={streamUrl} download className={styles.download}>↓ Download</a>

      <div className={styles.footer}>
        shared via <strong>vorevault ✦</strong> · the bullmoose archive
      </div>
    </main>
  );
}
