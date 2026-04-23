import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getFolder, listChildren, getBreadcrumbs,
  renameFolder, moveFolder, permanentDeleteFolder,
  FolderAuthError, FolderCollisionError, FolderCycleError,
  FolderNameError, FolderNotFoundError, FolderNotTrashedError,
} from "@/lib/folders";

type Ctx = { params: Promise<{ id: string }> };

async function safeRm(path: string | null): Promise<void> {
  if (!path) return;
  try { await rm(path, { recursive: true, force: true }); } catch { /* already gone */ }
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const folder = await getFolder(id);
  if (!folder) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [children, breadcrumbs] = await Promise.all([listChildren(id), getBreadcrumbs(id)]);
  return NextResponse.json({ folder, breadcrumbs, subfolders: children.subfolders, files: children.files });
}

const PatchSchema = z.union([
  z.object({ name: z.string().min(1).max(64) }),
  z.object({ parentId: z.string().uuid().nullable() }),
]);

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    if ("name" in parsed.data) {
      const folder = await renameFolder({ id, newName: parsed.data.name, actorId: user.id, isAdmin: user.is_admin });
      return NextResponse.json(folder, { status: 200 });
    }
    const folder = await moveFolder({ id, newParentId: parsed.data.parentId, actorId: user.id, isAdmin: user.is_admin });
    return NextResponse.json(folder, { status: 200 });
  } catch (err) {
    if (err instanceof FolderAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FolderCollisionError) return NextResponse.json({ error: "duplicate", existingId: err.existingId }, { status: 409 });
    if (err instanceof FolderCycleError) return NextResponse.json({ error: "cycle" }, { status: 400 });
    if (err instanceof FolderNameError) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    if (err instanceof FolderNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const { deletedFiles } = await permanentDeleteFolder({ id, actorId: user.id, isAdmin: user.is_admin });
    for (const f of deletedFiles) {
      await safeRm(f.storage_path.split("/").slice(0, -1).join("/"));
      await safeRm(f.transcoded_path);
      await safeRm(f.thumbnail_path);
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof FolderAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FolderNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof FolderNotTrashedError) return NextResponse.json({ error: "not_trashed" }, { status: 409 });
    throw err;
  }
}
