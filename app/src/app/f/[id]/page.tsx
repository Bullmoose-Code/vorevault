import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { getActiveShareLink } from "@/lib/share-links";
import { loadEnv } from "@/lib/env";
import { getBreadcrumbs } from "@/lib/folders";
import { isBookmarked } from "@/lib/bookmarks";
import { TopBar } from "@/components/TopBar";
import { MetaPanel, StatusPill } from "@/components/MetaPanel";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StarButton } from "@/components/StarButton";
import { FileActions } from "./FileActions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = { params: Promise<{ id: string }> };

export default async function FilePage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const file = await getFileWithUploader(id);
  if (!file) notFound();

  const [breadcrumbs, bookmarked] = await Promise.all([
    file.folder_id ? getBreadcrumbs(file.folder_id) : Promise.resolve([]),
    isBookmarked(user.id, file.id),
  ]);

  const isOwnerOrAdmin = file.uploader_id === user.id || user.is_admin;
  const env = loadEnv();
  const activeLink = await getActiveShareLink(file.id);
  const shareUrl = activeLink ? `${env.APP_PUBLIC_URL}/p/${activeLink.token}` : null;

  const isVideo = file.mime_type.startsWith("video/");
  const isAudio = file.mime_type.startsWith("audio/");
  const isImage = file.mime_type.startsWith("image/");

  return (
    <>
      <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />

      <div className={styles.back}><a href="/">← back to vault</a></div>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs crumbs={breadcrumbs.map(f => ({ id: f.id, name: f.name }))} />
      )}

      <div className={styles.content}>
        <div>
          {isVideo && (
            <video
              controls
              autoPlay
              playsInline
              preload="metadata"
              src={`/api/stream/${file.id}`}
              poster={file.thumbnail_path ? `/api/thumbs/${file.id}` : undefined}
              className={styles.player}
            />
          )}
          {isAudio && (
            <audio controls preload="metadata" src={`/api/stream/${file.id}`} className={styles.audio} />
          )}
          {isImage && (
            <img src={`/api/stream/${file.id}`} alt={file.original_name} className={styles.image} />
          )}
          {!isVideo && !isAudio && !isImage && (
            <div className={styles.noPreview}>
              No preview available for <code>{file.mime_type}</code>
            </div>
          )}

          {file.transcode_status === "pending" && isVideo && (
            <div className={`${styles.banner} ${styles.processing}`}>
              Processing video for optimized playback… Original is playable in the meantime.
            </div>
          )}

          {file.transcode_status === "failed" && (
            <div className={`${styles.banner} ${styles.failed}`}>
              Transcoding failed. The original file is available for download.
            </div>
          )}

          <h1 className={styles.title}>{file.original_name}</h1>
          <div className={styles.by}>
            uploaded by <strong>{file.uploader_name}</strong> ·{" "}
            {new Date(file.created_at).toLocaleString("en-US", {
              timeZone: "America/New_York",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>

          <StarButton fileId={file.id} initialBookmarked={bookmarked} />
          <FileActions
            fileId={file.id}
            fileName={file.original_name}
            initialFolderId={file.folder_id}
            isOwnerOrAdmin={isOwnerOrAdmin}
            initialShareUrl={shareUrl}
          />
        </div>

        <MetaPanel
          title="Details"
          rows={[
            { k: "Type", v: file.mime_type },
            { k: "Size", v: formatBytes(file.size_bytes) },
            ...(file.width && file.height
              ? [{ k: "Resolution", v: `${file.width} × ${file.height}` }]
              : []),
            ...(file.duration_sec != null
              ? [{ k: "Duration", v: formatDuration(file.duration_sec) }]
              : []),
            { k: "Transcode", v: <StatusPill status={file.transcode_status} /> },
            { k: "Uploader", v: file.uploader_name },
          ]}
        />
      </div>
    </>
  );
}
