import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  moveFile, FileAuthError, FileDeletedError, FileFolderNotFoundError, FileNotFoundError,
} from "@/lib/files";

const BodySchema = z.object({ folderId: z.string().uuid().nullable() });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const file = await moveFile({
      fileId: id, actorId: user.id, isAdmin: user.is_admin, folderId: parsed.data.folderId,
    });
    return NextResponse.json(file, { status: 200 });
  } catch (err) {
    if (err instanceof FileAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FileDeletedError) return NextResponse.json({ error: "file_deleted" }, { status: 400 });
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof FileFolderNotFoundError) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    throw err;
  }
}
