import type { FileWithUploader } from "@/lib/files";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function FileGrid({ files }: { files: FileWithUploader[] }) {
  if (files.length === 0) {
    return (
      <p style={{ textAlign: "center", color: "#666", marginTop: "3rem" }}>
        No files yet. <a href="/upload">Upload something!</a>
      </p>
    );
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: "1rem",
      marginTop: "1.5rem",
    }}>
      {files.map((f) => (
        <a
          key={f.id}
          href={`/f/${f.id}`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            borderRadius: 8,
            overflow: "hidden",
            background: "#1a1a2e",
            transition: "transform 0.15s",
          }}
        >
          <div style={{
            width: "100%",
            aspectRatio: "16/9",
            background: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}>
            {f.thumbnail_path ? (
              <img
                src={`/api/thumbs/${f.id}`}
                alt=""
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ color: "#555", fontSize: "0.8rem" }}>{f.mime_type}</span>
            )}
          </div>
          <div style={{ padding: "0.5rem 0.75rem" }}>
            <div style={{
              fontSize: "0.85rem",
              fontWeight: 500,
              color: "#eee",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {f.original_name}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
              {f.uploader_name} · {formatBytes(f.size_bytes)}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
