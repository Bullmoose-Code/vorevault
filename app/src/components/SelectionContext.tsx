"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SelectedItem =
  | { kind: "file"; id: string; name: string; canManage: boolean; folderId: string | null }
  | { kind: "folder"; id: string; name: string; canManage: boolean; parentId: string | null };

export type SelectionAnchor = { kind: "file" | "folder"; id: string } | null;

type Ctx = {
  items: SelectedItem[];
  size: number;
  anchorId: SelectionAnchor;
  isSelected: (kind: "file" | "folder", id: string) => boolean;
  toggle: (item: SelectedItem) => void;
  addRange: (items: SelectedItem[]) => void;
  clear: () => void;
};

const SelectionCtx = createContext<Ctx | null>(null);

export function useSelection(): Ctx {
  const v = useContext(SelectionCtx);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}

function itemKey(kind: "file" | "folder", id: string): string {
  return `${kind}:${id}`;
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [anchorId, setAnchorId] = useState<SelectionAnchor>(null);

  const isSelected = useCallback(
    (kind: "file" | "folder", id: string) => items.some((it) => it.kind === kind && it.id === id),
    [items],
  );

  const toggle = useCallback((item: SelectedItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.kind === item.kind && it.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      }
      return [...prev, item];
    });
    setAnchorId({ kind: item.kind, id: item.id });
  }, []);

  const addRange = useCallback((range: SelectedItem[]) => {
    if (range.length === 0) return;
    setItems((prev) => {
      const keys = new Set(prev.map((it) => itemKey(it.kind, it.id)));
      const added = range.filter((it) => !keys.has(itemKey(it.kind, it.id)));
      return added.length === 0 ? prev : [...prev, ...added];
    });
    const last = range[range.length - 1];
    setAnchorId({ kind: last.kind, id: last.id });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setAnchorId(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      size: items.length,
      anchorId,
      isSelected,
      toggle,
      addRange,
      clear,
    }),
    [items, anchorId, isSelected, toggle, addRange, clear],
  );

  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}
