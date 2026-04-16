import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/sessions";
import type { UserRow } from "@/lib/users";

const SESSION_COOKIE = "vv_session";

export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  return getSessionUser(sid);
}
