import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { FileGrid } from "@/components/FileGrid";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

export default async function Home({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listFiles(page, limit);
  const totalPages = Math.ceil(data.total / limit);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>VoreVault</h1>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "#888" }}>{user.username}</span>
          <a
            href="/upload"
            style={{
              padding: "0.5rem 1rem",
              background: "#5865F2",
              color: "white",
              textDecoration: "none",
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            Upload
          </a>
          <form action="/api/auth/logout" method="post" style={{ margin: 0 }}>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1rem",
                background: "#333",
                color: "#ccc",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </form>
        </div>
      </div>

      <FileGrid files={data.files} />

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "2rem" }}>
          {page > 1 && <a href={`/?page=${page - 1}`}>← Prev</a>}
          <span style={{ color: "#888" }}>Page {page} of {totalPages}</span>
          {page < totalPages && <a href={`/?page=${page + 1}`}>Next →</a>}
        </div>
      )}
    </main>
  );
}
