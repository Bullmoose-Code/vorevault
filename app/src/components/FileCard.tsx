import type { FileWithUploader } from "@/lib/files";
import styles from "./FileCard.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const ago = Date.now() - d.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function typeBadge(mime: string): string {
  const sub = mime.split("/")[1] ?? mime;
  return sub.slice(0, 4);
}

function tileClass(id: string): string {
  const n = (id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % 6;
  return styles[`tile${n + 1}`];
}

export function FileCard({
  file,
  isShared,
}: {
  file: FileWithUploader;
  isShared?: boolean;
}) {
  const duration = formatDuration(file.duration_sec);
  return (
    <a href={`/f/${file.id}`} className={styles.card}>
      <div className={styles.thumb}>
        {file.thumbnail_path ? (
          <img src={`/api/thumbs/${file.id}`} alt="" loading="lazy" />
        ) : (
          <div className={`${styles.tileFallback} ${tileClass(file.id)}`}>
            {file.mime_type}
          </div>
        )}
        <span className={styles.typeBadge}>{typeBadge(file.mime_type)}</span>
        {duration && <span className={styles.duration}>{duration}</span>}
        {isShared && <span className={styles.sharedBadge}>✦ shared</span>}
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{file.original_name}</div>
        <div className={`vv-meta ${styles.sub}`}>
          {file.uploader_name} · <strong>{formatBytes(file.size_bytes)}</strong> · <strong>{relativeTime(file.created_at)}</strong>
        </div>
      </div>
    </a>
  );
}
