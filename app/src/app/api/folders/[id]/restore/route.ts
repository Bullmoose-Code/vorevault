import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { restoreFolder, FolderCollisionError, FolderNotFoundError } from "@/lib/folders";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const counts = await restoreFolder({ id, actorId: user.id });
    return NextResponse.json({ restored: true, ...counts });
  } catch (err) {
    if (err instanceof FolderCollisionError) return NextResponse.json({ error: "duplicate", existingId: err.existingId }, { status: 409 });
    if (err instanceof FolderNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw err;
  }
}
