"use client";

import { useRef, useState } from "react";
import styles from "./DropZone.module.css";

export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    onFiles(Array.from(e.dataTransfer.files));
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    onFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <div className={styles.inner}>
        <div className={styles.icon}>✦</div>
        <h3 className={styles.heading}>Drop files here</h3>
        <div className={styles.limit}>
          or pick them manually · mp4, mov, png, jpg, gif, anything really
        </div>
        <label className={styles.picker} onClick={(e) => e.stopPropagation()}>
          Choose files
          <input
            ref={inputRef}
            type="file"
            multiple
            className={styles.hiddenInput}
            onChange={handlePick}
          />
        </label>
      </div>
    </div>
  );
}
