import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UploadClient } from "./UploadClient";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <div className={styles.main}>
        <div className={styles.back}><a href="/">← back to vault</a></div>

        <div className={styles.header}>
          <h1 className={`vv-greeting ${styles.heading}`}>Drop something in the vault.</h1>
          <div className="vv-meta">Up to <strong>10 GB</strong> per file · resumable</div>
        </div>

        <UploadClient />

        <div className={styles.tip}>
          <span className={styles.tipIcon}>✦</span>
          <div>
            <strong>Heads up:</strong> videos that aren&apos;t already h264 mp4 will auto-transcode in the background — you&apos;ll see a <em>&ldquo;Processing…&rdquo;</em> banner on the file page until it&apos;s ready. Originals are always playable in the meantime.
          </div>
        </div>
      </div>
    </>
  );
}
