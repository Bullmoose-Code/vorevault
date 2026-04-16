import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listAllUsers, getDiskUsage } from "@/lib/admin";
import { BanButton } from "./AdminActions";

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
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>
      <p><a href="/">← back to vault</a></p>
      <h1>Admin</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Disk Usage</h2>
        <table style={{ borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <tbody>
            <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Active files</td><td>{disk.total_files}</td></tr>
            <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Total size</td><td>{formatBytes(disk.total_bytes)}</td></tr>
            <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Pending transcode</td><td>{disk.pending_transcode}</td></tr>
            <tr><td style={{ paddingRight: "1rem", color: "#666" }}>Deleted (pending cleanup)</td><td>{disk.deleted_pending_cleanup}</td></tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Users ({users.length})</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Username</th>
              <th style={{ padding: "0.5rem" }}>Files</th>
              <th style={{ padding: "0.5rem" }}>Size</th>
              <th style={{ padding: "0.5rem" }}>Admin</th>
              <th style={{ padding: "0.5rem" }}>Banned</th>
              <th style={{ padding: "0.5rem" }}>Last Login</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: "0.5rem" }}>
                  {u.avatar_url && <img src={u.avatar_url} alt="" width={20} height={20} style={{ borderRadius: "50%", verticalAlign: "middle", marginRight: 6 }} />}
                  {u.username}
                </td>
                <td style={{ padding: "0.5rem" }}>{u.file_count}</td>
                <td style={{ padding: "0.5rem" }}>{formatBytes(Number(u.total_bytes))}</td>
                <td style={{ padding: "0.5rem" }}>{u.is_admin ? "Yes" : ""}</td>
                <td style={{ padding: "0.5rem", color: u.is_banned ? "#d9534f" : "inherit" }}>{u.is_banned ? "BANNED" : ""}</td>
                <td style={{ padding: "0.5rem", color: "#888" }}>
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "never"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {u.id !== user.id && <BanButton userId={u.id} isBanned={u.is_banned} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
