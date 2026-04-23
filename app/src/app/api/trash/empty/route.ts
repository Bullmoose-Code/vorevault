import { NextRequest, NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { listTrashedItems, permanentDeleteFolder } from "@/lib/folders";
import { permanentDeleteFile } from "@/lib/files";

export const dynamic = "force-dynamic";

async function safeRm(path: string | null): Promise<void> {
  if (!path) return;
  try { await rm(path, { recursive: true, force: true }); } catch { /* already gone */ }
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let totalFiles = 0;
  let totalFolders = 0;

  // Paginate through trash, permanent-deleting each top-level item.
  while (true) {
    const { items } = await listTrashedItems({ page: 1, limit: 100 });
    if (items.length === 0) break;
    for (const item of items) {
      if (item.kind === "folder") {
        const { deletedFiles } = await permanentDeleteFolder({ id: item.id, actorId: user.id, isAdmin: true });
        for (const f of deletedFiles) {
          await safeRm(f.storage_path.split("/").slice(0, -1).join("/"));
          await safeRm(f.transcoded_path);
          await safeRm(f.thumbnail_path);
        }
        totalFolders += 1;
        totalFiles += deletedFiles.length;
      } else {
        const f = await permanentDeleteFile({ fileId: item.id, actorId: user.id, isAdmin: true });
        await safeRm(f.storage_path.split("/").slice(0, -1).join("/"));
        await safeRm(f.transcoded_path);
        await safeRm(f.thumbnail_path);
        totalFiles += 1;
      }
    }
  }

  return NextResponse.json({ emptied: true, folders: totalFolders, files: totalFiles });
}
