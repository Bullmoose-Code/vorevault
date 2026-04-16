import { NextRequest, NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { getSessionUser } from "@/lib/sessions";
import { hardDeleteFile } from "@/lib/files";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

async function safeRm(path: string | null): Promise<void> {
  if (!path) return;
  try { await rm(path, { recursive: true, force: true }); } catch {}
}

export async function POST(req: NextRequest) {
  const sid = req.cookies.get("vv_session")?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user?.is_admin) return new NextResponse("admin required", { status: 403 });

  const { fileId } = (await req.json()) as { fileId: string };
  const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
  const file = rows[0] ?? null;
  if (file) {
    await safeRm(file.storage_path.split("/").slice(0, -1).join("/"));
    await safeRm(file.transcoded_path);
    await safeRm(file.thumbnail_path);
  }
  await hardDeleteFile(fileId);
  return NextResponse.json({ ok: true });
}
