import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFolderWithCreator, listChildrenWithUploader, getBreadcrumbs } from "@/lib/folders";
import { TopBar } from "@/components/TopBar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FolderTile } from "@/components/FolderTile";
import { FileCard } from "@/components/FileCard";
import { FolderActions } from "./FolderActions";
import { NewFolderButton } from "@/components/NewFolderButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const folder = await getFolderWithCreator(id);
  if (!folder) notFound();

  const [children, breadcrumbs] = await Promise.all([listChildrenWithUploader(id), getBreadcrumbs(id)]);
  const canManage = user.is_admin || folder.created_by === user.id;

  return (
    <main className={styles.page}>
      <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
      <Breadcrumbs crumbs={breadcrumbs.map((f) => ({ id: f.id, name: f.name }))} />

      <div className={styles.folderHeader}>
        <h1 className={`vv-greeting ${styles.folderTitle}`}>{folder.name}</h1>
        <NewFolderButton parentId={folder.id} parentName={folder.name} />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.meta}>
          created by <strong>@{folder.creator_username}</strong> · {children.subfolders.length} subfolders · {children.files.length} files
        </div>
        <FolderActions folder={folder} canManage={canManage} />
      </div>

      {children.subfolders.length > 0 && (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>Subfolders</h2>
          <div className={styles.folderGrid}>
            {children.subfolders.map((f) => (
              <FolderTile key={f.id} id={f.id} name={f.name}
                fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count} />
            ))}
          </div>
        </>
      )}

      {children.files.length > 0 && (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>Files in this folder</h2>
          <div className={styles.fileGrid}>
            {children.files.map((f) => <FileCard key={f.id} file={f} />)}
          </div>
        </>
      )}
    </main>
  );
}
