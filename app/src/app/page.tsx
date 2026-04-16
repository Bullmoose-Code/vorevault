import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>VoreVault</h1>
      <p>Hello, <strong>{user.username}</strong>.</p>
      <p>Features coming. See <a href="/api/health">/api/health</a>.</p>
      <form action="/api/auth/logout" method="post">
        <button type="submit" style={{ marginTop: "1rem" }}>Log out</button>
      </form>
    </main>
  );
}
