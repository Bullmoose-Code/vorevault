import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessions";
import { toggleBan } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sid = req.cookies.get("vv_session")?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user?.is_admin) return new NextResponse("admin required", { status: 403 });

  const { userId, banned } = (await req.json()) as { userId: string; banned: boolean };
  await toggleBan(userId, banned);
  return NextResponse.json({ ok: true });
}
