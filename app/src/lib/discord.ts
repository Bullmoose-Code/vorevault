import { loadEnv } from "@/lib/env";

const TOKEN_URL = "https://discord.com/api/oauth2/token";
const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const SCOPE = "identify guilds.members.read";

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

export async function exchangeCodeForToken(code: string): Promise<string> {
  const env = loadEnv();
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });
  const res = await fetch(TOKEN_URL, {
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
  const res = await fetch(
    `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
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
