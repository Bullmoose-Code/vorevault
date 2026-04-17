import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listAllUsers, getDiskUsage } from "@/lib/admin";
import { StatCard } from "@/components/StatCard";
import { BanButton } from "./AdminActions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [users, disk] = await Promise.all([listAllUsers(), getDiskUsage()]);

  return (
    <>
      <div className={styles.adminStrip}>
        <span className={styles.adminLabel}>admin · vorevault</span>
        <a href="/">← back to vault</a>
      </div>

      <main className={styles.main}>
        <h2 className={styles.sectionTitle}>Disk usage</h2>
        <div className={styles.statsGrid}>
          <StatCard label="Active files" value={disk.total_files} />
          <StatCard label="Total size" value={formatBytes(disk.total_bytes)} />
          <StatCard label="Pending transcode" value={disk.pending_transcode} />
          <StatCard label="Deleted (pending cleanup)" value={disk.deleted_pending_cleanup} />
        </div>

        <h2 className={styles.sectionTitle}>Users ({users.length})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Files</th>
                <th>Size</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={styles.name}>
                    <span className={styles.avatar}>
                      {u.avatar_url ? <img src={u.avatar_url} alt="" /> : null}
                    </span>
                    {u.username}
                    {u.is_admin && <span className={`${styles.rolePill} ${styles.admin}`}>admin</span>}
                    {u.is_banned && <span className={styles.bannedPill}>banned</span>}
                  </td>
                  <td>{u.file_count}</td>
                  <td>{formatBytes(Number(u.total_bytes))}</td>
                  <td>
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleString("en-US", {
                          timeZone: "America/New_York",
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "never"}
                  </td>
                  <td>
                    {u.id !== user.id && <BanButton userId={u.id} isBanned={u.is_banned} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
