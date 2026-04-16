import { NextRequest, NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { getSessionUser } from "@/lib/sessions";
import { getFile } from "@/lib/files";
import { createShareLink, getActiveShareLink, revokeAllForFile } from "@/lib/share-links";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "vv_session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const env = loadEnv();
  const { id } = await ctx.params;
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse("auth required", { status: 401 });

  const file = await getFile(id);
  if (!file) return new NextResponse("not found", { status: 404 });

  const body = (await req.json()) as { action: "create" | "revoke" };

  if (body.action === "revoke") {
    await revokeAllForFile(id);
    return NextResponse.json({ revoked: true });
  }

  const existing = await getActiveShareLink(id);
  if (existing) {
    return NextResponse.json({
      token: existing.token,
      url: `${env.APP_PUBLIC_URL}/p/${existing.token}`,
    });
  }

  const link = await createShareLink(id, user.id);
  return NextResponse.json({
    token: link.token,
    url: `${env.APP_PUBLIC_URL}/p/${link.token}`,
  });
}
