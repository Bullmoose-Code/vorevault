import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { SidebarChromeProvider, SidebarBackdrop, SidebarOpenClass } from "@/components/SidebarChrome";
import { MobileFAB } from "@/components/MobileFAB";
import { UploadProgressProvider } from "@/components/UploadProgressProvider";
import { UploadProgressDrawer } from "@/components/UploadProgressDrawer";
import styles from "./shell.module.css";

export const dynamic = "force-dynamic";

async function deriveCurrentFolderId(): Promise<string | null> {
  const h = await headers();
  const pathname = h.get("x-vv-pathname") ?? "";
  const match = pathname.match(/^\/d\/([^/]+)/);
  return match ? match[1] : null;
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const currentFolderId = await deriveCurrentFolderId();

  return (
    <UploadProgressProvider>
      <SidebarChromeProvider>
        <SidebarOpenClass>
          <div className={styles.shell}>
            <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
            <div className={styles.body}>
              <Sidebar isAdmin={user.is_admin} currentFolderId={currentFolderId} />
              <main className={styles.main}>{children}</main>
            </div>
            <SidebarBackdrop />
            <MobileFAB />
            <UploadProgressDrawer />
          </div>
        </SidebarOpenClass>
      </SidebarChromeProvider>
    </UploadProgressProvider>
  );
}
