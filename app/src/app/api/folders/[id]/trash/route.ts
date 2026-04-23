import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trashFolder, FolderAuthError, FolderNotFoundError } from "@/lib/folders";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const counts = await trashFolder({ id, actorId: user.id, isAdmin: user.is_admin });
    return NextResponse.json({ trashed: true, ...counts });
  } catch (err) {
    if (err instanceof FolderAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof FolderNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw err;
  }
}
