"use client";

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from "react";
import * as tus from "tus-js-client";
import type { UploadState } from "./UploadRow";

export type UploadRow = UploadState & {
  id: string;
  folderId: string | null;
  startedAt: number;
};

type Ctx = {
  uploads: UploadRow[];
  enqueue: (file: File, folderId: string | null) => void;
  cancel: (id: string) => void;
  clearCompleted: () => void;
};

const UploadProgressContext = createContext<Ctx | null>(null);

export function useUploadProgress(): Ctx {
  const v = useContext(UploadProgressContext);
  if (!v) throw new Error("useUploadProgress must be inside <UploadProgressProvider>");
  return v;
}

export function UploadProgressProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const instances = useRef<Map<string, tus.Upload>>(new Map());

  const enqueue = useCallback((file: File, folderId: string | null) => {
    const id = crypto.randomUUID();
    const row: UploadRow = {
      id,
      folderId,
      startedAt: Date.now(),
      name: file.name,
      size: file.size,
      uploaded: 0,
      status: "uploading",
    };
    setUploads((prev) => [...prev, row]);

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
      },
      onProgress: (uploaded) => {
        setUploads((s) => s.map((u) => (u.id === id ? { ...u, uploaded } : u)));
      },
      onSuccess: () => {
        setUploads((s) =>
          s.map((u) => (u.id === id ? { ...u, status: "done", uploaded: u.size } : u)),
        );
        window.dispatchEvent(new CustomEvent("vorevault:upload-done", { detail: { id } }));
      },
    });
    instances.current.set(id, upload);
    upload.start();
  }, []);

  const cancel = useCallback((id: string) => {
    const upload = instances.current.get(id);
    if (upload) void upload.abort(true);
    instances.current.delete(id);
    setUploads((s) => s.filter((u) => u.id !== id));
  }, []);

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
