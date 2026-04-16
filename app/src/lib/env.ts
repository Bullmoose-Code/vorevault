import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_REQUIRED_ROLE_ID: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  APP_PUBLIC_URL: z.string().url(),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(): Env {
  const result = Schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}
