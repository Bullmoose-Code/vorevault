import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles, listRecentFiles } from "@/lib/files";
import { listTopLevelFolders } from "@/lib/folders";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { NewFolderButton } from "@/components/NewFolderButton";
import { RecentStrip } from "@/components/RecentStrip";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const RECENT_STRIP_COUNT = 6;

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const ago = Date.now() - date.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;

  const [recent, folders, data] = await Promise.all([
    listRecentFiles(RECENT_STRIP_COUNT),
    listTopLevelFolders(),
    listFiles(page, limit, undefined, RECENT_STRIP_COUNT),
  ]);

  const lastUpload = recent[0]?.created_at ?? null;
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">welcome back, <strong>{user.username}</strong>.</h1>
        {recent.length > 0 && (
          <div className="vv-meta">
            <strong>{recent.length + data.total}</strong> clips · last upload <strong>{relativeTime(lastUpload)}</strong>
          </div>
        )}
      </div>

      <RecentStrip files={recent} />

      <section className={styles.foldersSection}>
        <div className={styles.foldersHeader}>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>folders</h2>
          <NewFolderButton parentId={null} parentName={null} />
        </div>
        {folders.length === 0 ? (
          <p className={styles.foldersEmpty}>no folders yet. create one with the + new folder button above.</p>
        ) : (
          <div className={styles.folderGrid}>
            {folders.map((f) => (
              <FolderTile key={f.id} id={f.id} name={f.name}
                fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count} />
            ))}
          </div>
        )}
      </section>

      {data.files.length > 0 ? (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>all clips</h2>
          <div className={styles.grid}>
            {data.files.map((f) => <FileCard key={f.id} file={f} />)}
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 && <a href={`/?page=${page - 1}`}>← prev</a>}
              <span>page {page} of {totalPages}</span>
              {page < totalPages && <a href={`/?page=${page + 1}`}>next →</a>}
            </div>
          )}
        </>
      ) : recent.length === 0 ? (
        <div className={styles.empty}>
          <h2 className="vv-title">drop the first clip in the vault.</h2>
        </div>
      ) : null}
    </>
  );
}
