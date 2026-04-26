import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/discord";
import { formatDesktopState, validateDesktopState } from "@/lib/desktop-state";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vv_oauth_state";
const STATE_TTL_SEC = 600;

function badRequest(msg: string): NextResponse {
  return new NextResponse(msg, { status: 400 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const port = url.searchParams.get("port");
  const code_challenge = url.searchParams.get("code_challenge");

  const validated = validateDesktopState(port, code_challenge);
  if (!validated) return badRequest("invalid port or code_challenge");

  const state = formatDesktopState(validated);
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
