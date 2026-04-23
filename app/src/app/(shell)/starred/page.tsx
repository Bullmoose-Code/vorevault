import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listBookmarksWithUploader } from "@/lib/bookmarks";
import { FileCard } from "@/components/FileCard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function StarredPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { items } = await listBookmarksWithUploader(user.id, 100, 0);

  return (
    <main className={styles.page}>
      <h1 className={`vv-title ${styles.title}`}>starred</h1>
      {items.length === 0 ? (
        <p className={styles.empty}>nothing starred yet. tap ★ on any file to pin it here.</p>
      ) : (
        <div className={styles.grid}>
          {items.map((b) => <FileCard key={b.file.id} file={b.file} />)}
        </div>
      )}
    </main>
  );
}
