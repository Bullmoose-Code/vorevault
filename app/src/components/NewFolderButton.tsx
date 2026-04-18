"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewFolderDialog } from "./NewFolderDialog";
import styles from "./NewFolderButton.module.css";

type Props = {
  parentId: string | null;
  parentName: string | null;
};

export function NewFolderButton({ parentId, parentName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={() => setOpen(true)}
      >
        + New folder
      </button>
      <NewFolderDialog
        open={open}
        onClose={() => setOpen(false)}
        parentId={parentId}
        parentName={parentName}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
