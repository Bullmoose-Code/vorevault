import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { listTopLevelFolders } from "@/lib/folders";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { NewFolderButton } from "@/components/NewFolderButton";
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

type Props = { searchParams: Promise<{ page?: string; mine?: string }> };

export default async function Home({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const mineOnly = params.mine === "1";
  const limit = 24;
  const [data, folders] = await Promise.all([
    listFiles(page, limit, mineOnly ? user.id : undefined),
    listTopLevelFolders(),
  ]);
  const totalPages = Math.ceil(data.total / limit);

  const totalBytes = data.files.reduce((sum, f) => sum + Number(f.size_bytes), 0);
  const lastUpload = data.files[0]?.created_at ?? null;

  const pageHref = (p: number) =>
    mineOnly ? `/?mine=1&page=${p}` : `/?page=${p}`;

  return (
    <>
      <main className={styles.main}>
        <div className={styles.subheader}>
          <h1 className="vv-greeting">
            {mineOnly ? (
              <>Your uploads, <strong>{user.username}</strong>.</>
            ) : (
              <>Welcome back, <strong>{user.username}</strong>.</>
            )}
          </h1>
          {data.files.length > 0 && (
            <div className="vv-meta">
              <strong>{data.total}</strong> {data.total === 1 ? "clip" : "clips"} · <strong>{formatBytes(totalBytes)}</strong> · last upload <strong>{relativeTime(lastUpload)}</strong>
              {mineOnly && <> · <a href="/">view all</a></>}
            </div>
          )}
        </div>

        {!mineOnly && (
          <section className={styles.foldersSection}>
            <div className={styles.foldersHeader}>
              <h2 className={`vv-section-label ${styles.sectionLabel}`}>Folders</h2>
              <NewFolderButton parentId={null} parentName={null} />
            </div>
            {folders.length === 0 ? (
              <p className={styles.foldersEmpty}>
                No folders yet. Create one with the + New folder button above.
              </p>
            ) : (
              <div className={styles.folderGrid}>
                {folders.map((f) => (
                  <FolderTile key={f.id} id={f.id} name={f.name}
                    fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count} />
                ))}
              </div>
            )}
          </section>
        )}

        {data.files.length === 0 ? (
          <div className={styles.empty}>
            {mineOnly ? (
              <>
                <h2 className="vv-title">You haven&apos;t uploaded anything yet.</h2>
                <Pill variant="primary" href="/upload">↑ Upload</Pill>
              </>
            ) : (
              <>
                <h2 className="vv-title">Drop the first clip in the vault.</h2>
                <Pill variant="primary" href="/upload">↑ Upload</Pill>
              </>
            )}
          </div>
        ) : (
          <>
            {data.files.length > 0 && (
              <h2 className={`vv-section-label ${styles.sectionLabel}`}>Recent uploads</h2>
            )}
            <div className={styles.grid}>
              {data.files.map((f) => (
                <FileCard key={f.id} file={f} />
              ))}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            {page > 1 && <a href={pageHref(page - 1)}>← Prev</a>}
            <span>Page {page} of {totalPages}</span>
            {page < totalPages && <a href={pageHref(page + 1)}>Next →</a>}
          </div>
        )}
      </main>
    </>
  );
}
