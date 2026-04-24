"use client";

import { useEffect, useState } from "react";
import styles from "./TextPreview.module.css";

type State =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "error" };

export function TextPreview({ fileId }: { fileId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/stream/${fileId}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const text = await res.text();
        if (!cancelled) setState({ kind: "ready", text });
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [fileId]);

  return (
    <div className={styles.box}>
      {state.kind === "loading" && <div className={styles.status}>loading…</div>}
      {state.kind === "error" && <div className={styles.status}>couldn&apos;t load this file.</div>}
      {state.kind === "ready" && <pre className={styles.pre}>{state.text}</pre>}
    </div>
  );
}
