"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
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
  const kids = childrenByParent.get(node.id) ?? [];
  const hasKids = kids.length > 0;

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
        <Link href={`/d/${node.id}`} className={styles.link}>
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
