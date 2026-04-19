import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listBookmarksWithUploader } from "@/lib/bookmarks";
import { TopBar } from "@/components/TopBar";
import { FileCard } from "@/components/FileCard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { items } = await listBookmarksWithUploader(user.id, 100, 0);

  return (
    <main className={styles.page}>
      <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
      <h1 className={`vv-title ${styles.title}`}>Saved</h1>
      {items.length === 0 ? (
        <p className={styles.empty}>No saved files yet. Tap the star on any file to save it here.</p>
      ) : (
        <div className={styles.grid}>
          {items.map((b) => <FileCard key={b.file.id} file={b.file} />)}
        </div>
      )}
    </main>
  );
}
