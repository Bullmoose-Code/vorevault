import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/discord";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vv_oauth_state";
const STATE_TTL_SEC = 600;

export async function GET() {
  const state = randomBytes(32).toString("base64url");
  const res = NextResponse.redirect(buildAuthorizeUrl(state), { status: 307 });
  res.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
  return res;
}
