"use client";

import Link from "next/link";
import { useState, useMemo, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { decodeDragPayload, dropTargetIsValid, VV_DRAG_MIME } from "@/lib/dragDrop";
import { moveItems } from "@/lib/moveItems";
import { useItemActions } from "./ItemActionProvider";
import styles from "./VaultTree.module.css";

export type FolderNode = { id: string; name: string; parent_id: string | null };

export function VaultTreeView({ nodes }: { nodes: FolderNode[] }) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, FolderNode[]>();
    for (const n of nodes) {
      const k = n.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    for (const [, list] of map) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [nodes]);

  const roots = childrenByParent.get(null) ?? [];
  return (
    <ul className={styles.tree}>
      {roots.map((n) => (
        <TreeNode key={n.id} node={n} childrenByParent={childrenByParent} depth={0} />
      ))}
    </ul>
  );
}

function TreeNode({
  node, childrenByParent, depth,
}: {
  node: FolderNode;
  childrenByParent: Map<string | null, FolderNode[]>;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const kids = childrenByParent.get(node.id) ?? [];
  const hasKids = kids.length > 0;

  const router = useRouter();
  const { showToast } = useItemActions();

  function onDragOver(e: DragEvent<HTMLAnchorElement>) {
    if (!Array.from(e.dataTransfer.types).includes(VV_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHover(true);
  }
  function onDragLeave() { setDropHover(false); }
  async function onDrop(e: DragEvent<HTMLAnchorElement>) {
    setDropHover(false);
    const items = decodeDragPayload(e.dataTransfer);
    if (!items) return;
    e.preventDefault();
    if (!dropTargetIsValid(node.id, items)) return;
    const result = await moveItems(items, node.id);
    if (result.failed === 0) {
      showToast({ message: `moved ${result.succeeded}`, variant: "success" });
    } else {
      showToast({ message: `moved ${result.succeeded}, failed ${result.failed}`, variant: "error" });
    }
    router.refresh();
  }

  return (
    <li className={styles.node} style={{ paddingLeft: `${depth * 12}px` }}>
      <div className={styles.row}>
        {hasKids ? (
          <button
            type="button"
            className={styles.caret}
            aria-label={`${open ? "collapse" : "expand"} ${node.name}`}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className={styles.caretSpacer} />
        )}
        <Link
          href={`/d/${node.id}`}
          className={`${styles.link} ${dropHover ? styles.dropTarget : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {node.name}
        </Link>
      </div>
      {open && hasKids && (
        <ul className={styles.tree}>
          {kids.map((k) => (
            <TreeNode key={k.id} node={k} childrenByParent={childrenByParent} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
