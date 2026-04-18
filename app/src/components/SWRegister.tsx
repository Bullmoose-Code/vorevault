"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW registration failed", err);
    });
  }, []);
  return null;
}
