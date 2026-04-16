import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UploadClient } from "./UploadClient";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Upload to VoreVault</h1>
      <p>Drop files anywhere on this page. Resumable — close and reopen the tab safely.</p>
      <UploadClient />
      <p style={{ marginTop: "2rem" }}><a href="/">← back home</a></p>
    </main>
  );
}
