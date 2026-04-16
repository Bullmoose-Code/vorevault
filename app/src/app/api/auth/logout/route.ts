import { NextRequest, NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { destroySession } from "@/lib/sessions";

export const dynamic = "force-dynamic";
const SESSION_COOKIE = "vv_session";

export async function POST(req: NextRequest) {
  const env = loadEnv();
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (sid) await destroySession(sid);
  const res = NextResponse.redirect(`${env.APP_PUBLIC_URL}/login`, { status: 307 });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
