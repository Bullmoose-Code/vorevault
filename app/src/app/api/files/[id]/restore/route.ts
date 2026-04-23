import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { restoreFile, FileNotFoundError } from "@/lib/files";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await restoreFile({ fileId: id, actorId: user.id });
    return NextResponse.json({ restored: true });
  } catch (err) {
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw err;
  }
}
