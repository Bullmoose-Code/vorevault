import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { removeBookmark } from "@/lib/bookmarks";

const ParamsSchema = z.object({ fileId: z.string().uuid() });
type Ctx = { params: Promise<{ fileId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  await removeBookmark(user.id, parsed.data.fileId);
  return new NextResponse(null, { status: 204 });
}
