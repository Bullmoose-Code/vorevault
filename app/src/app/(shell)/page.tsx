import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTopLevelItems, listRecentTopLevelItems } from "@/lib/files";
import { listTopLevelFolders } from "@/lib/folders";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { NewFolderButton } from "@/components/NewFolderButton";
import { PaginationLink } from "@/components/PaginationLink";
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
    listRecentTopLevelItems(RECENT_STRIP_COUNT),
    listTopLevelFolders(),
    listTopLevelItems(page, limit, { extraOffset: RECENT_STRIP_COUNT }),
  ]);

  const lastUpload = recent[0]?.created_at ?? null;
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">welcome back, <strong>{user.username}</strong>.</h1>
        {recent.length > 0 && (
          <div className="vv-meta">
            <strong>{recent.length + data.total}</strong> items · last upload <strong>{relativeTime(lastUpload)}</strong>
          </div>
        )}
      </div>

      <RecentStrip items={recent} />

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
                fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count}
                createdBy={f.created_by} parentId={null} />
            ))}
          </div>
        )}
      </section>

      {data.items.length > 0 ? (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>all files</h2>
          <div className={styles.grid}>
            {data.items.map((it) => it.kind === "folder" ? (
              <FolderTile key={`f-${it.id}`} id={it.id} name={it.name}
                fileCount={it.direct_file_count} subfolderCount={it.direct_subfolder_count}
                createdBy={it.created_by} parentId={null} />
            ) : (
              <FileCard key={`x-${it.id}`} file={it} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 && <PaginationLink href={`/?page=${page - 1}`}>← prev</PaginationLink>}
              <span>page {page} of {totalPages}</span>
              {page < totalPages && <PaginationLink href={`/?page=${page + 1}`}>next →</PaginationLink>}
            </div>
          )}
        </>
      ) : recent.length === 0 ? (
        <div className={styles.empty}>
          <h2 className="vv-title">drop the first file in the vault.</h2>
        </div>
      ) : null}
    </>
  );
}
