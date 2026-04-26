import { NextRequest, NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { exchangeCodeForToken, fetchGuildMember } from "@/lib/discord";
import { upsertUserFromDiscord } from "@/lib/users";
import { createSession, SESSION_TTL_SEC } from "@/lib/sessions";
import { parseDesktopState } from "@/lib/desktop-state";
import { createAuthCode } from "@/lib/auth-codes";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vv_oauth_state";
const SESSION_COOKIE = "vv_session";

function badRequest(msg: string) {
  return new NextResponse(msg, { status: 400 });
}
function forbidden(msg: string) {
  return new NextResponse(msg, { status: 403 });
}

export async function GET(req: NextRequest) {
  const env = loadEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateInUrl = url.searchParams.get("state");
  const stateInCookie = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !stateInUrl) return badRequest("missing code or state");
  if (!stateInCookie || stateInCookie !== stateInUrl) return badRequest("state mismatch");

  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(code);
  } catch (e) {
    console.error("Discord token exchange failed:", e);
    return new NextResponse(
      "Failed to reach Discord. Please try again.",
      { status: 503 },
    );
  }

  let member: Awaited<ReturnType<typeof fetchGuildMember>>;
  try {
    member = await fetchGuildMember(accessToken);
  } catch (e) {
    console.error("Discord guild member fetch failed:", e);
    return new NextResponse(
      "Failed to reach Discord. Please try again.",
      { status: 503 },
    );
  }

  if (!member) return forbidden("You must be a member of the Bullmoose Discord server.");
  if (!member.hasRequiredRole) {
    return forbidden("You don't have the required Discord role.");
  }

  const user = await upsertUserFromDiscord(member.profile);
  const userAgent = req.headers.get("user-agent");
  const session = await createSession(user.id, userAgent);

  // Desktop OAuth branch: when state encodes a desktop port + code_challenge,
  // mint a single-use auth code bound to the challenge and redirect the
  // browser to the desktop's localhost listener with the CODE (not the
  // session token). The desktop then POSTs {code, code_verifier} to
  // /api/auth/desktop-exchange to redeem the actual session token. This
  // keeps the long-lived session credential out of any URL or browser
  // history. PKCE-style flow per RFC 7636. We still set vv_session on
  // the response so the same browser stays signed in to the web app.
  const desktopState = parseDesktopState(stateInUrl);
  if (desktopState) {
    const authCode = await createAuthCode(session.id, desktopState.code_challenge);
    const localUrl = `http://127.0.0.1:${desktopState.port}/?code=${authCode}`;
    const desktopRes = NextResponse.redirect(localUrl, { status: 307 });
    desktopRes.cookies.set({
      name: SESSION_COOKIE,
      value: session.id,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });
    desktopRes.cookies.set({
      name: STATE_COOKIE,
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return desktopRes;
  }

  const res = NextResponse.redirect(`${env.APP_PUBLIC_URL}/`, { status: 307 });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: session.id,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  res.cookies.set({
    name: STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
