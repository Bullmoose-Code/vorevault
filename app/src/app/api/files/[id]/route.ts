import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getFileWithUploader, renameFile, permanentDeleteFile,
  FileAuthError, FileDeletedError, FileNameError, FileNotFoundError, FileNotTrashedError,
} from "@/lib/files";
import { getBreadcrumbs } from "@/lib/folders";
import { isBookmarked } from "@/lib/bookmarks";

async function safeRm(path: string | null): Promise<void> {
  if (!path) return;
  try { await rm(path, { recursive: true, force: true }); } catch { /* already gone */ }
}

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const file = await getFileWithUploader(id);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [folderBreadcrumbs, bookmarked] = await Promise.all([
    file.folder_id ? getBreadcrumbs(file.folder_id) : Promise.resolve([]),
    isBookmarked(user.id, file.id),
  ]);

  return NextResponse.json({
    ...file,
    folderId: file.folder_id,
    folderBreadcrumbs,
    bookmarked,
  });
}

const PatchBodySchema = z.object({ name: z.string() });

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const file = await renameFile({
      fileId: id, actorId: user.id, isAdmin: user.is_admin, newName: parsed.data.name,
    });
    return NextResponse.json(file, { status: 200 });
  } catch (err) {
    if (err instanceof FileNameError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof FileAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FileDeletedError) return NextResponse.json({ error: "file_deleted" }, { status: 400 });
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const file = await permanentDeleteFile({ fileId: id, actorId: user.id, isAdmin: user.is_admin });
    await safeRm(file.storage_path.split("/").slice(0, -1).join("/"));
    await safeRm(file.transcoded_path);
    await safeRm(file.thumbnail_path);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof FileAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof FileNotTrashedError) return NextResponse.json({ error: "not_trashed" }, { status: 409 });
    throw err;
  }
}
