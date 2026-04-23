import { rm } from "node:fs/promises";
import { getExpiredDeletedFiles, hardDeleteFile } from "@/lib/files";
import { getExpiredTrashedFolders, permanentDeleteFolder } from "@/lib/folders";
import { pool } from "@/lib/db";

const RETENTION_DAYS = 30;

async function safeRm(path: string | null): Promise<void> {
  if (!path) return;
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // file already gone — fine
  }
}

export async function cleanupExpiredFiles(): Promise<number> {
  const expired = await getExpiredDeletedFiles(RETENTION_DAYS);
  for (const file of expired) {
    await safeRm(file.storage_path.split("/").slice(0, -1).join("/")); // rm the <uuid>/ dir
    await safeRm(file.transcoded_path);
    await safeRm(file.thumbnail_path);
    await hardDeleteFile(file.id);
    console.log(`cleanup: hard-deleted file ${file.id} (${file.original_name})`);
  }
  return expired.length;
}

export async function cleanupExpiredFolders(): Promise<number> {
  const expired = await getExpiredTrashedFolders(RETENTION_DAYS);
  for (const folder of expired) {
    const { deletedFiles } = await permanentDeleteFolder({
      id: folder.id, actorId: "system", isAdmin: true,
    });
    for (const f of deletedFiles) {
      await safeRm(f.storage_path.split("/").slice(0, -1).join("/"));
      await safeRm(f.transcoded_path);
      await safeRm(f.thumbnail_path);
    }
    console.log(`cleanup: permanent-deleted folder ${folder.id} (${folder.name}) + ${deletedFiles.length} files`);
  }
  return expired.length;
}

export async function cleanupOrphanUploads(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM upload_sessions
     WHERE file_id IS NULL AND created_at < now() - interval '1 day'`,
  );
  const count = result.rowCount ?? 0;
  if (count > 0) console.log(`cleanup: purged ${count} orphan upload sessions`);
  return count;
}

export async function runCleanup(): Promise<void> {
  try {
    await cleanupExpiredFiles();
    await cleanupExpiredFolders();
    await cleanupOrphanUploads();
  } catch (err) {
    console.error("cleanup error:", err);
  }
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let running = false;

export function startCleanupWorker(): void {
  if (running) return;
  running = true;
  console.log("cleanup worker: started (runs every hour)");

  async function tick() {
    await runCleanup();
    setTimeout(tick, CLEANUP_INTERVAL_MS);
  }

  setTimeout(tick, 5 * 60 * 1000);
}
