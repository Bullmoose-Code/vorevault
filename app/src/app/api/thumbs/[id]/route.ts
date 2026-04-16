import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getSessionUser } from "@/lib/sessions";
import { getFile } from "@/lib/files";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "vv_session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse(null, { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse(null, { status: 401 });

  const file = await getFile(id);
  if (!file?.thumbnail_path) return new NextResponse(null, { status: 404 });

  try {
    const buf = await readFile(file.thumbnail_path);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
