import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { getActiveShareLink } from "@/lib/share-links";
import { loadEnv } from "@/lib/env";
import { FileActions } from "./FileActions";

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

  const isOwnerOrAdmin = file.uploader_id === user.id || user.is_admin;
  const env = loadEnv();
  const activeLink = await getActiveShareLink(file.id);
  const shareUrl = activeLink ? `${env.APP_PUBLIC_URL}/p/${activeLink.token}` : null;
  const isVideo = file.mime_type.startsWith("video/");
  const isAudio = file.mime_type.startsWith("audio/");
  const isImage = file.mime_type.startsWith("image/");

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      <p><a href="/">← back to vault</a></p>

      {isVideo && (
        <video
          controls
          autoPlay
          playsInline
          preload="metadata"
          src={`/api/stream/${file.id}`}
          poster={file.thumbnail_path ? `/api/thumbs/${file.id}` : undefined}
          style={{ width: "100%", maxHeight: "70vh", background: "#000", borderRadius: 8 }}
        />
      )}

      {isAudio && (
        <audio controls preload="metadata" src={`/api/stream/${file.id}`} style={{ width: "100%" }} />
      )}

      {isImage && (
        <img
          src={`/api/stream/${file.id}`}
          alt={file.original_name}
          style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
        />
      )}

      {!isVideo && !isAudio && !isImage && (
        <div style={{
          padding: "3rem", textAlign: "center", background: "#f0f0f0", borderRadius: 8,
        }}>
          <p>No preview available for <code>{file.mime_type}</code></p>
        </div>
      )}

      {file.transcode_status === "pending" && file.mime_type.startsWith("video/") && (
        <div style={{
          marginTop: "1rem",
          padding: "0.75rem 1rem",
          background: "#2a2a3e",
          borderRadius: 6,
          color: "#f0ad4e",
          fontSize: "0.9rem",
        }}>
          Processing video for optimized playback... Original is playable in the meantime.
        </div>
      )}

      {file.transcode_status === "failed" && (
        <div style={{
          marginTop: "1rem",
          padding: "0.75rem 1rem",
          background: "#2a1a1a",
          borderRadius: 6,
          color: "#d9534f",
          fontSize: "0.9rem",
        }}>
          Transcoding failed. The original file is available for download.
        </div>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>{file.original_name}</h2>

      <table style={{ marginTop: "0.5rem", borderCollapse: "collapse", fontSize: "0.9rem" }}>
        <tbody>
          <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Uploaded by</td><td>{file.uploader_name}</td></tr>
          <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Type</td><td>{file.mime_type}</td></tr>
          <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Size</td><td>{formatBytes(file.size_bytes)}</td></tr>
          {file.width && file.height && (
            <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Resolution</td><td>{file.width}x{file.height}</td></tr>
          )}
          {file.duration_sec != null && (
            <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Duration</td><td>{formatDuration(file.duration_sec)}</td></tr>
          )}
          <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Transcode</td><td>{file.transcode_status}</td></tr>
          <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Uploaded</td><td>{new Date(file.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</td></tr>
        </tbody>
      </table>

      <FileActions fileId={file.id} isOwnerOrAdmin={isOwnerOrAdmin} initialShareUrl={shareUrl} />
    </main>
  );
}
