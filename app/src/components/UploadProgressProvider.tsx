"use client";

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";

export type UploadStatus = "pending" | "uploading" | "done" | "error";

export type ActiveUpload = {
  id: string;
  folderId: string | null;
  startedAt: number;
  name: string;
  size: number;
  uploaded: number;
  status: UploadStatus;
  error?: string;
};

type Ctx = {
  uploads: ActiveUpload[];
  enqueue: (file: File, folderId: string | null) => void;
  cancel: (id: string) => void;
  clearCompleted: () => void;
};

// Browsers cap concurrent HTTP/1.1 connections per origin at ~6. Starting more
// than a handful of tus.Upload instances at once causes pending requests to
// queue in the browser, and long queues manifest as ProgressEvent errors.
const MAX_CONCURRENT = 3;

const UploadProgressContext = createContext<Ctx | null>(null);

export function useUploadProgress(): Ctx {
  const v = useContext(UploadProgressContext);
  if (!v) throw new Error("useUploadProgress must be inside <UploadProgressProvider>");
  return v;
}

type QueuedJob = { id: string; file: File; folderId: string | null };

export function UploadProgressProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<ActiveUpload[]>([]);
  const instances = useRef<Map<string, tus.Upload>>(new Map());
  const pendingQueue = useRef<QueuedJob[]>([]);
  const inflight = useRef(0);
  const router = useRouter();

  const pumpRef = useRef<() => void>(() => {});

  const startOne = useCallback((job: QueuedJob) => {
    const { id, file, folderId } = job;
    setUploads((s) =>
      s.map((u) => (u.id === id ? { ...u, status: "uploading" as const } : u)),
    );
    const upload = new tus.Upload(file, {
      endpoint: "/files/",
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 64 * 1024 * 1024,
      metadata: {
        filename: file.name,
        filetype: file.type || "application/octet-stream",
        ...(folderId ? { folderId } : {}),
      },
      onError: (err) => {
        setUploads((s) =>
          s.map((u) => (u.id === id ? { ...u, status: "error", error: String(err) } : u)),
        );
        instances.current.delete(id);
        inflight.current -= 1;
        pumpRef.current();
      },
      onProgress: (uploaded) => {
        setUploads((s) => s.map((u) => (u.id === id ? { ...u, uploaded } : u)));
      },
      onSuccess: () => {
        setUploads((s) =>
          s.map((u) => (u.id === id ? { ...u, status: "done", uploaded: u.size } : u)),
        );
        window.dispatchEvent(new CustomEvent("vorevault:upload-done", { detail: { id } }));
        router.refresh();
        instances.current.delete(id);
        inflight.current -= 1;
        pumpRef.current();
      },
    });
    instances.current.set(id, upload);
    inflight.current += 1;
    upload.start();
  }, [router]);

  const pump = useCallback(() => {
    while (inflight.current < MAX_CONCURRENT && pendingQueue.current.length > 0) {
      const next = pendingQueue.current.shift()!;
      startOne(next);
    }
  }, [startOne]);
  pumpRef.current = pump;

  const enqueue = useCallback((file: File, folderId: string | null) => {
    const id = crypto.randomUUID();
    const row: ActiveUpload = {
      id,
      folderId,
      startedAt: Date.now(),
      name: file.name,
      size: file.size,
      uploaded: 0,
      status: "pending",
    };
    setUploads((prev) => [...prev, row]);
    pendingQueue.current.push({ id, file, folderId });
    pump();
  }, [pump]);

  const cancel = useCallback((id: string) => {
    const upload = instances.current.get(id);
    if (upload) {
      void upload.abort(true);
      instances.current.delete(id);
      inflight.current -= 1;
    }
    pendingQueue.current = pendingQueue.current.filter((q) => q.id !== id);
    setUploads((s) => s.filter((u) => u.id !== id));
    pump();
  }, [pump]);

  const clearCompleted = useCallback(() => {
    setUploads((s) => s.filter((u) => u.status !== "done" && u.status !== "error"));
  }, []);

  const value = useMemo(
    () => ({ uploads, enqueue, cancel, clearCompleted }),
    [uploads, enqueue, cancel, clearCompleted],
  );

  return (
    <UploadProgressContext.Provider value={value}>
      {children}
    </UploadProgressContext.Provider>
  );
}
