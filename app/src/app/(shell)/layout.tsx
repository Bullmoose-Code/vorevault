import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { SidebarChromeProvider, SidebarBackdrop, SidebarOpenClass } from "@/components/SidebarChrome";
import { MobileFAB } from "@/components/MobileFAB";
import { UploadProgressProvider } from "@/components/UploadProgressProvider";
import { UploadProgressDrawer } from "@/components/UploadProgressDrawer";
import { CurrentUserProvider } from "@/components/CurrentUserContext";
import { ItemActionProvider } from "@/components/ItemActionProvider";
import { SelectionProvider } from "@/components/SelectionContext";
import { SelectionChrome } from "@/components/SelectionChrome";
import { GridKeyboard } from "@/components/GridKeyboard";
import { GridMarquee } from "@/components/GridMarquee";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { GlobalDropTarget } from "@/components/GlobalDropTarget";
import { GridChromeGate } from "@/components/GridChromeGate";
import { ScrollRestorer } from "@/components/ScrollRestorer";
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
          <CurrentUserProvider value={{ id: user.id, isAdmin: user.is_admin }}>
            <ItemActionProvider>
              <SelectionProvider>
                <SelectionChrome />
                <Suspense fallback={null}>
                  <ScrollRestorer />
                </Suspense>
                <GridChromeGate>
                  <GridKeyboard />
                  <GridMarquee />
                </GridChromeGate>
                <GlobalDropTarget currentFolderId={currentFolderId} />
                <div className={styles.shell}>
                  <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
                  <div className={styles.body}>
                    <Sidebar isAdmin={user.is_admin} currentFolderId={currentFolderId} />
                    <main id="vv-main-scroll" className={styles.main}>
                      <GridChromeGate>
                        <SelectionToolbar />
                      </GridChromeGate>
                      {children}
                    </main>
                  </div>
                  <SidebarBackdrop />
                  <MobileFAB currentFolderId={currentFolderId} />
                  <UploadProgressDrawer />
                </div>
              </SelectionProvider>
            </ItemActionProvider>
          </CurrentUserProvider>
        </SidebarOpenClass>
      </SidebarChromeProvider>
    </UploadProgressProvider>
  );
}
