import { NextRequest, NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { exchangeCodeForToken, fetchGuildMember } from "@/lib/discord";
import { upsertUserFromDiscord } from "@/lib/users";
import { createSession } from "@/lib/sessions";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "vv_oauth_state";
const SESSION_COOKIE = "vv_session";
const SESSION_TTL_SEC = 24 * 60 * 60;

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
