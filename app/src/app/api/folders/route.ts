import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  createFolder,
  FolderCollisionError,
  FolderNameError,
  FolderNotFoundError,
} from "@/lib/folders";

const BodySchema = z.object({
  name: z.string().min(1).max(64),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const folder = await createFolder({
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      createdBy: user.id,
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    if (err instanceof FolderNameError) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    if (err instanceof FolderCollisionError) return NextResponse.json({ error: "duplicate", existingId: err.existingId }, { status: 409 });
    if (err instanceof FolderNotFoundError) return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
    throw err;
  }
}
