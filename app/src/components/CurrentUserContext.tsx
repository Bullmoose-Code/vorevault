"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CurrentUser = { id: string; isAdmin: boolean };

const Ctx = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  value,
  children,
}: {
  value: CurrentUser;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCurrentUser must be used inside <CurrentUserProvider>");
  return v;
}
