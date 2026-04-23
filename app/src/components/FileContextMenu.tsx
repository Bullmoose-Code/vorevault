"use client";

import { useRouter } from "next/navigation";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import type { FileWithUploader } from "@/lib/files";
import { useCurrentUser } from "./CurrentUserContext";
import { useItemActions } from "./ItemActionProvider";
import styles from "./FileContextMenu.module.css";

type Props = {
  file: FileWithUploader;
  children: ReactNode;
};

function programmaticDownload(fileId: string) {
  const a = document.createElement("a");
  a.href = `/api/stream/${fileId}`;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FileContextMenu({ file, children }: Props) {
  const router = useRouter();
  const user = useCurrentUser();
  const actions = useItemActions();
  const canManage = user.isAdmin || file.uploader_id === user.id;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={styles.content}>
          <ContextMenu.Item className={styles.item} onSelect={() => router.push(`/f/${file.id}`)}>
            open
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.item} onSelect={() => programmaticDownload(file.id)}>
            download
          </ContextMenu.Item>
          <ContextMenu.Item className={styles.item} onSelect={() => actions.copyPublicLink(file.id)}>
            copy public link
          </ContextMenu.Item>
          {canManage && (
            <>
              <ContextMenu.Separator className={styles.sep} />
              <ContextMenu.Item
                className={styles.item}
                onSelect={() =>
                  actions.openRename(
                    { kind: "file", id: file.id, currentName: file.original_name },
                    async (next) => {
                      const res = await fetch(`/api/files/${file.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: next }),
                      });
                      if (!res.ok) {
                        const data = (await res.json().catch(() => ({}))) as { error?: string };
                        throw new Error(data.error ?? res.statusText);
                      }
                    },
                  )
                }
              >
                rename
              </ContextMenu.Item>
              <ContextMenu.Item
                className={styles.item}
                onSelect={() =>
                  actions.openMove(
                    { kind: "file", id: file.id, currentName: file.original_name, initialFolderId: file.folder_id },
                    async (folderId) => {
                      const res = await fetch(`/api/files/${file.id}/move`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ folderId }),
                      });
                      if (!res.ok) {
                        const data = (await res.json().catch(() => ({}))) as { error?: string };
                        throw new Error(data.error ?? res.statusText);
                      }
                    },
                  )
                }
              >
                move to…
              </ContextMenu.Item>
              <ContextMenu.Separator className={styles.sep} />
              <ContextMenu.Item
                className={`${styles.item} ${styles.danger}`}
                onSelect={() =>
                  actions.openConfirmTrash(
                    { kind: "file", id: file.id, currentName: file.original_name },
                    async () => {
                      const res = await fetch(`/api/files/${file.id}/trash`, { method: "POST" });
                      if (!res.ok) throw new Error(`trash failed: ${res.status}`);
                    },
                  )
                }
              >
                move to trash
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
