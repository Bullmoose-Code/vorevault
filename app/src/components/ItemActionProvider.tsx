"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, PromptDialog } from "./Dialogs";
import { FolderPicker } from "./FolderPicker";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Toast, type ToastItem, type ToastVariant } from "./Toast";

export type ItemKind = "file" | "folder";

export type ItemRef = {
  kind: ItemKind;
  id: string;
  currentName: string;
  initialFolderId?: string | null;
};

type RenameCb = (newName: string) => Promise<void>;
type MoveCb = (newFolderId: string | null) => Promise<void>;
type TrashCb = () => Promise<void>;

type Ctx = {
  openRename: (ref: ItemRef, onSave: RenameCb) => void;
  openMove: (ref: ItemRef, onSave: MoveCb) => void;
  openConfirmTrash: (ref: ItemRef, onConfirm: TrashCb) => void;
  copyPublicLink: (fileId: string) => Promise<void>;
  showToast: (args: { message: string; variant?: ToastVariant }) => void;
};

const ActionCtx = createContext<Ctx | null>(null);

export function useItemActions(): Ctx {
  const v = useContext(ActionCtx);
  if (!v) throw new Error("useItemActions must be used inside <ItemActionProvider>");
  return v;
}

type RenameState = { ref: ItemRef; onSave: RenameCb } | null;
type MoveState = { ref: ItemRef; onSave: MoveCb; target: string | null } | null;
type TrashState = { ref: ItemRef; onConfirm: TrashCb } | null;

export function ItemActionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [rename, setRename] = useState<RenameState>(null);
  const [move, setMove] = useState<MoveState>(null);
  const [trash, setTrash] = useState<TrashState>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback<Ctx["showToast"]>(({ message, variant = "info" }) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => {
      const next = [...prev, { id, message, variant }];
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openRename = useCallback<Ctx["openRename"]>((ref, onSave) => setRename({ ref, onSave }), []);
  const openMove = useCallback<Ctx["openMove"]>(
    (ref, onSave) => setMove({ ref, onSave, target: ref.initialFolderId ?? null }),
    [],
  );
  const openConfirmTrash = useCallback<Ctx["openConfirmTrash"]>(
    (ref, onConfirm) => setTrash({ ref, onConfirm }),
    [],
  );

  const copyPublicLink = useCallback<Ctx["copyPublicLink"]>(
    async (fileId) => {
      try {
        const res = await fetch(`/api/files/${fileId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create" }),
        });
        if (!res.ok) throw new Error(`share create failed: ${res.status}`);
        const data = (await res.json()) as { url: string };
        await navigator.clipboard.writeText(data.url);
        showToast({ message: "public link copied", variant: "success" });
      } catch (e) {
        showToast({ message: `couldn't copy link: ${(e as Error).message}`, variant: "error" });
      }
    },
    [showToast],
  );

  const value = useMemo<Ctx>(
    () => ({ openRename, openMove, openConfirmTrash, copyPublicLink, showToast }),
    [openRename, openMove, openConfirmTrash, copyPublicLink, showToast],
  );

  return (
    <ActionCtx.Provider value={value}>
      {children}

      <PromptDialog
        open={rename != null}
        onClose={() => setRename(null)}
        title={rename?.ref.kind === "folder" ? "rename folder" : "rename file"}
        label="name"
        initialValue={rename?.ref.currentName ?? ""}
        confirmLabel="save"
        onConfirm={async (next) => {
          if (!rename) return;
          try {
            await rename.onSave(next);
            setRename(null);
            router.refresh();
            showToast({ message: "renamed", variant: "success" });
          } catch (e) {
            showToast({ message: `rename failed: ${(e as Error).message}`, variant: "error" });
            throw e;
          }
        }}
      />

      <Modal
        open={move != null}
        onClose={() => setMove(null)}
        title={move?.ref.kind === "folder" ? "move folder" : "move file"}
      >
        {move && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FolderPicker value={move.target} onChange={(v) => setMove({ ...move, target: v })} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" variant="ghost" onClick={() => setMove(null)}>cancel</Button>
              <Button
                type="button"
                variant="primary"
                onClick={async () => {
                  try {
                    await move.onSave(move.target);
                    setMove(null);
                    router.refresh();
                    showToast({ message: "moved", variant: "success" });
                  } catch (e) {
                    showToast({ message: `move failed: ${(e as Error).message}`, variant: "error" });
                  }
                }}
              >
                save
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={trash != null}
        onClose={() => setTrash(null)}
        title={trash?.ref.kind === "folder" ? "move folder to trash" : "move to trash"}
        message={
          trash?.ref.kind === "folder"
            ? `move "${trash?.ref.currentName}" and its contents to trash? can be restored within 30 days.`
            : "move this file to trash? it can be restored within 30 days."
        }
        confirmLabel="trash"
        variant="danger"
        onConfirm={async () => {
          if (!trash) return;
          try {
            await trash.onConfirm();
            setTrash(null);
            router.refresh();
            showToast({ message: "moved to trash", variant: "success" });
          } catch (e) {
            showToast({ message: `trash failed: ${(e as Error).message}`, variant: "error" });
            throw e;
          }
        }}
      />

      <Toast items={toasts} onDismiss={dismissToast} />
    </ActionCtx.Provider>
  );
}
