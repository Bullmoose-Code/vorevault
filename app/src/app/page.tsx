import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { TopBar } from "@/components/TopBar";
import { FileCard } from "@/components/FileCard";
import { Pill } from "@/components/Pill";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const ago = Date.now() - date.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Props = { searchParams: Promise<{ page?: string }> };

export default async function Home({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listFiles(page, limit);
  const totalPages = Math.ceil(data.total / limit);

  const totalBytes = data.files.reduce((sum, f) => sum + Number(f.size_bytes), 0);
  const lastUpload = data.files[0]?.created_at ?? null;

  return (
    <>
      <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
      <main className={styles.main}>
        <div className={styles.subheader}>
          <h1 className={styles.greeting}>
            Welcome back, <strong>{user.username}</strong>.
          </h1>
          {data.files.length > 0 && (
            <div className={styles.stats}>
              <strong>{data.total}</strong> {data.total === 1 ? "clip" : "clips"} · <strong>{formatBytes(totalBytes)}</strong> · last upload {relativeTime(lastUpload)}
            </div>
          )}
        </div>

        {data.files.length === 0 ? (
          <div className={styles.empty}>
            <h2>Drop the first clip in the vault.</h2>
            <Pill variant="primary" href="/upload">↑ Upload</Pill>
          </div>
        ) : (
          <div className={styles.grid}>
            {data.files.map((f) => (
              <FileCard key={f.id} file={f} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            {page > 1 && <a href={`/?page=${page - 1}`}>← Prev</a>}
            <span>Page {page} of {totalPages}</span>
            {page < totalPages && <a href={`/?page=${page + 1}`}>Next →</a>}
          </div>
        )}
      </main>
    </>
  );
}
