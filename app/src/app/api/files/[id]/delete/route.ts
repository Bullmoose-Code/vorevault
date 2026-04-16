import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessions";
import { getFile, softDeleteFile } from "@/lib/files";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "vv_session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse("auth required", { status: 401 });

  const file = await getFile(id);
  if (!file) return new NextResponse("not found", { status: 404 });

  const isOwner = file.uploader_id === user.id;
  const isAdmin = user.is_admin;
  if (!isOwner && !isAdmin) {
    return new NextResponse("forbidden", { status: 403 });
  }

  await softDeleteFile(id);
  return NextResponse.json({ deleted: true });
}
