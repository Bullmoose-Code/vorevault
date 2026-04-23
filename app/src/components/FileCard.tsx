import type { FileWithUploader } from "@/lib/files";
import { classifyFile } from "@/lib/fileKind";
import { FileIcon } from "./FileIcon";
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

export function FileCard({
  file,
  isShared,
}: {
  file: FileWithUploader;
  isShared?: boolean;
}) {
  const { kind, label } = classifyFile(file.mime_type, file.original_name);
  const duration = (kind === "video" || kind === "audio") ? formatDuration(file.duration_sec) : null;
  const hasThumb = file.thumbnail_path != null;

  return (
    <a href={`/f/${file.id}`} className={styles.card}>
      <div className={styles.thumb}>
        {hasThumb ? (
          <img src={`/api/thumbs/${file.id}`} alt="" loading="lazy" />
        ) : (
          <div className={`${styles.iconTile} ${styles[`kind_${kind.replaceAll("-", "_")}`]}`}>
            <FileIcon kind={kind} size={48} />
          </div>
        )}
        <span className={styles.typeBadge}>{label}</span>
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
