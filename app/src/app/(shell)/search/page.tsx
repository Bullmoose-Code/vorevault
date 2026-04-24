import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { searchEverything } from "@/lib/search";
import { FolderTile } from "@/components/FolderTile";
import { FileCard } from "@/components/FileCard";
import { TagChip } from "@/components/TagChip";
import type { FileWithUploader } from "@/lib/files";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { q, folder } = await searchParams;
  if (!q || q.trim().length < 2) {
    return (
      <>
        <p className={styles.empty}>Query too short.</p>
      </>
    );
  }
  const result = await searchEverything({ query: q, limit: 50, offset: 0, scopeFolderId: folder });
  const fileCards: FileWithUploader[] = result.files.map(({ uploader_username, ...rest }) => ({
    ...rest, uploader_name: uploader_username,
  }));

  const totalResults = result.folders.length + fileCards.length + result.tags.length;

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">search: <em>{q}</em></h1>
        <p className="vv-meta">
          <strong>{totalResults}</strong> {totalResults === 1 ? "result" : "results"} for <em>&ldquo;{q}&rdquo;</em>
        </p>
      </div>
      {result.tags.length > 0 && (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>Tags</h2>
          <div className={styles.tagRow}>
            {result.tags.map((t) => (
              <TagChip key={t.id} name={`${t.name} (${t.file_count})`} href={`/?tag=${t.id}`} />
            ))}
          </div>
        </>
      )}
      {result.folders.length > 0 && (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>Folders</h2>
          <div className={styles.folderGrid}>
            {result.folders.map((f) => (
              <FolderTile key={f.id} id={f.id} name={f.name} fileCount={0} subfolderCount={0}
                createdBy={f.created_by} parentId={f.parent_id} />
            ))}
          </div>
        </>
      )}
      {fileCards.length > 0 && (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>Files</h2>
          <div className={styles.fileGrid}>
            {fileCards.map((f) => <FileCard key={f.id} file={f} />)}
          </div>
        </>
      )}
      {totalResults === 0 && (
        <p className={styles.empty}>No matches. Try a shorter or fuzzier query.</p>
      )}
    </>
  );
}
