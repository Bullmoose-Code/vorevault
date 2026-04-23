"use client";

import { useRouter } from "next/navigation";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { useCurrentUser } from "./CurrentUserContext";
import { useItemActions } from "./ItemActionProvider";
import styles from "./FolderContextMenu.module.css";

type FolderProp = { id: string; name: string; createdBy: string; parentId: string | null };

type Props = { folder: FolderProp; children: ReactNode };

export function FolderContextMenu({ folder, children }: Props) {
  const router = useRouter();
  const user = useCurrentUser();
  const actions = useItemActions();
  const canManage = user.isAdmin || folder.createdBy === user.id;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={styles.content}>
          <ContextMenu.Item className={styles.item} onSelect={() => router.push(`/d/${folder.id}`)}>
            open
          </ContextMenu.Item>
          {canManage && (
            <>
              <ContextMenu.Separator className={styles.sep} />
              <ContextMenu.Item
                className={styles.item}
                onSelect={() =>
                  actions.openRename(
                    { kind: "folder", id: folder.id, currentName: folder.name },
                    async (next) => {
                      const res = await fetch(`/api/folders/${folder.id}`, {
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
                    { kind: "folder", id: folder.id, currentName: folder.name, initialFolderId: folder.parentId },
                    async (newParentId) => {
                      const res = await fetch(`/api/folders/${folder.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ parentId: newParentId }),
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
                    { kind: "folder", id: folder.id, currentName: folder.name },
                    async () => {
                      const res = await fetch(`/api/folders/${folder.id}/trash`, { method: "POST" });
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
