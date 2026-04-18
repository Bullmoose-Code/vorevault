import { loadEnv } from "@/lib/env";

const TOKEN_URL = "https://discord.com/api/oauth2/token";
const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const SCOPE = "identify guilds.members.read";

// LXC 105's Docker bridge has intermittent DNS/TCP flakiness reaching Discord
// (see compose.yaml's 8.8.8.8 comment). One retry with a short backoff covers
// the transient cases without masking a real outage.
const DISCORD_TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = 500;

type TokenResponse = { access_token: string; token_type: string };
type DiscordUser = { id: string; username: string; avatar: string | null };
type GuildMemberResponse = { user: DiscordUser; roles: string[] };

export type GuildMember = {
  profile: DiscordUser;
  hasRequiredRole: boolean;
};

export function buildAuthorizeUrl(state: string): string {
  const env = loadEnv();
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    state,
    prompt: "none",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; name?: string } }).cause;
    if (cause?.code) return `${err.name}/${cause.code}`;
    if (cause?.name) return `${err.name}/${cause.name}`;
    return err.name;
  }
  return String(err);
}

async function runOnce(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Retry only on network-level errors (fetch throws / abort) because Discord
// never saw the request — safe to resend. HTTP responses (including 5xx) are
// retried only when the caller opts in via retry5xx, used for idempotent GETs.
// Token exchange must NOT retry 5xx: Discord may have consumed the auth code.
async function discordFetch(
  url: string,
  init: RequestInit,
  opts: { retry5xx?: boolean } = {},
): Promise<Response> {
  try {
    const res = await runOnce(url, init);
    if (opts.retry5xx && res.status >= 500 && res.status < 600) {
      console.warn(`Discord ${url} returned ${res.status}, retrying once`);
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      return await runOnce(url, init);
    }
    return res;
  } catch (err) {
    console.warn(`Discord ${url} network error (${errorName(err)}), retrying once`);
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    return await runOnce(url, init);
  }
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const env = loadEnv();
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });
  const res = await discordFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as TokenResponse;
  return data.access_token;
}

export async function fetchGuildMember(accessToken: string): Promise<GuildMember | null> {
  const env = loadEnv();
  const res = await discordFetch(
    `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { retry5xx: true },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Discord guild member fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as GuildMemberResponse;
  return {
    profile: data.user,
    hasRequiredRole: data.roles.includes(env.DISCORD_REQUIRED_ROLE_ID),
  };
}
