import { notFound } from "next/navigation";
import { getShareLink } from "@/lib/share-links";
import { getFile } from "@/lib/files";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
    <main style={{
      fontFamily: "system-ui",
      padding: "2rem",
      maxWidth: 960,
      margin: "0 auto",
      background: "#0d0d1a",
      minHeight: "100vh",
      color: "#eee",
    }}>
      {isVideo && (
        <video
          controls
          autoPlay
          playsInline
          preload="metadata"
          src={streamUrl}
          style={{ width: "100%", maxHeight: "70vh", background: "#000", borderRadius: 8 }}
        />
      )}

      {isAudio && (
        <audio controls preload="metadata" src={streamUrl} style={{ width: "100%" }} />
      )}

      {isImage && (
        <img
          src={streamUrl}
          alt={file.original_name}
          style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
        />
      )}

      {!isVideo && !isAudio && !isImage && (
        <div style={{ padding: "3rem", textAlign: "center", background: "#1a1a2e", borderRadius: 8 }}>
          <p>No preview available for <code>{file.mime_type}</code></p>
        </div>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <h2 style={{ margin: 0 }}>{file.original_name}</h2>
        <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.5rem" }}>
          {file.mime_type} · {formatBytes(file.size_bytes)}
        </p>
        <a
          href={streamUrl}
          download
          style={{
            display: "inline-block",
            marginTop: "1rem",
            padding: "0.5rem 1.5rem",
            background: "#5865F2",
            color: "white",
            textDecoration: "none",
            borderRadius: 6,
          }}
        >
          Download
        </a>
      </div>

      <p style={{ marginTop: "3rem", fontSize: "0.75rem", color: "#555" }}>
        Shared via <strong>VoreVault</strong>
      </p>
    </main>
  );
}
