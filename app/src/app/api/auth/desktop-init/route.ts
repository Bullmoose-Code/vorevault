import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/discord";
import { formatDesktopState, parseDesktopState } from "@/lib/desktop-state";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vv_oauth_state";
const STATE_TTL_SEC = 600;

function badRequest(msg: string): NextResponse {
  return new NextResponse(msg, { status: 400 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const portStr = url.searchParams.get("port") ?? "";
  const csrf = url.searchParams.get("csrf") ?? "";

  // Reuse the same validation as parseDesktopState by formatting → parsing.
  // This guarantees desktop-init's accepted inputs are exactly what the
  // callback will later accept on the way back from Discord.
  const port = parseInt(portStr, 10);
  if (Number.isNaN(port)) return badRequest("invalid port");
  const candidate = formatDesktopState({ port, csrf });
  const parsed = parseDesktopState(candidate);
  if (!parsed) return badRequest("invalid port or csrf");

  const state = candidate;
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
