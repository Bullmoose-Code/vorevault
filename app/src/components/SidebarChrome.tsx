"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type Ctx = { open: boolean; toggle: () => void; close: () => void };
// Default is a no-op so consumers (e.g., TopBar) can render outside the provider
// without crashing — important during the migration in Tasks 11–13 where some
// pages still import TopBar before they move into (shell).
const SidebarContext = createContext<Ctx>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function SidebarChromeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change (App Router soft navigations don't fire popstate).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function close() { setOpen(false); }
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarChrome(): Ctx {
  return useContext(SidebarContext);
}

export function SidebarBackdrop() {
  const { open, close } = useSidebarChrome();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="close sidebar"
      onClick={close}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        border: 0, padding: 0, zIndex: 25,
      }}
    />
  );
}

export function SidebarOpenClass({ children }: { children: ReactNode }) {
  const { open } = useSidebarChrome();
  return <div data-sidebar-open={open ? "true" : "false"}>{children}</div>;
}
