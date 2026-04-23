import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { FolderNotFoundError } from "@/lib/folders";
import { normalizePaths, InvalidFolderPathError } from "@/lib/folder-paths";
import { createFolderTree } from "@/lib/folder-tree-create";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { rows } = await pool.query<{ id: string; name: string; parent_id: string | null }>(
    `SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL ORDER BY LOWER(name)`,
  );
  return NextResponse.json({ folders: rows });
}

const PostBody = z.object({
  parent_id: z.string().uuid().nullable(),
  paths: z.array(z.string().min(1).max(512)).min(1).max(5000),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let paths: string[];
  try {
    paths = normalizePaths(parsed.data.paths);
  } catch (err) {
    if (err instanceof InvalidFolderPathError) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
    throw err;
  }

  try {
    const folders = await createFolderTree({
      parentId: parsed.data.parent_id,
      paths,
      actorId: user.id,
    });
    return NextResponse.json({ folders });
  } catch (err) {
    if (err instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
    }
    throw err;
  }
}
