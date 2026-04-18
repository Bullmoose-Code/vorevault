import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getFolder, listChildren, getBreadcrumbs,
  renameFolder, moveFolder, deleteFolder,
  FolderAuthError, FolderCollisionError, FolderCycleError,
  FolderNameError, FolderNotFoundError,
} from "@/lib/folders";

type Ctx = { params: Promise<{ id: string }> };

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
    await deleteFolder({ id, actorId: user.id, isAdmin: user.is_admin });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof FolderAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FolderNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw err;
  }
}
