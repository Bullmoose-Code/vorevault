# UI Consistency Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore visual consistency across header, folder UI, and pages; add folder-creation as a first-class action on main + folder-detail pages; replace the `prompt()`-driven folder picker with a mobile-friendly modal.

**Architecture:** One new `Modal` primitive (overlay + sheet, portal, focus trap, bottom-sheet on mobile). A drill-down `FolderPickerModal` body component sits inside it; `FolderPicker` becomes a trigger button that opens the modal (same external API so `UploadClient`/`FileActions` don't change). A `NewFolderDialog` + `NewFolderButton` pair gets wired into the main page and folder detail page. SearchBar is tokenized and gains an `overlay` variant used by a new mobile search overlay in `TopBar`. FolderTile / `/search` / `/d/[id]` / `/f/[id]` module CSS gets tokenized in place.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, React 19, Vitest 2.1 + (new) jsdom + @testing-library/react. No new runtime deps — all design-system primitives hand-built from CSS tokens in `src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-04-18-ui-consistency-pass-design.md`

**Branch:** `feat/ui-consistency-pass` (already created, forked from latest main; spec committed).

---

## Task 1: Add component-test infra (jsdom + @testing-library/react)

**Files:**
- Modify: `app/package.json`
- Create: `app/tests/component-setup.ts`

**Context:** The repo has zero component tests today. `vitest.config.ts` uses `environment: "node"`. We add jsdom and RTL as devDeps and use Vitest's per-file `// @vitest-environment jsdom` pragma for component tests — no global config change required.

- [ ] **Step 1: Install devDeps**

```bash
cd /root/vorevault/app
npm install --save-dev jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

Expected: adds exactly 4 entries under `devDependencies`. Lockfile updates. Run `npm ls --depth=0 | grep -E "jsdom|testing-library"` to confirm.

- [ ] **Step 2: Create component-test setup helper**

File: `app/tests/component-setup.ts`

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Smoke test — make sure jsdom + RTL wire up correctly**

File: `app/src/components/_infra.test.tsx`

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("component test infra", () => {
  it("renders a React tree in jsdom and finds text", () => {
    render(<p>hello</p>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the smoke test**

```bash
cd /root/vorevault/app
npx vitest run src/components/_infra.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Delete the smoke test and commit infra**

```bash
rm app/src/components/_infra.test.tsx
```

```bash
cd /root/vorevault
git add app/package.json app/package-lock.json app/tests/component-setup.ts
git commit -m "chore(tests): add jsdom + @testing-library/react for component tests"
```

---

## Task 2: `Modal` primitive

**Files:**
- Create: `app/src/components/Modal.tsx`
- Create: `app/src/components/Modal.module.css`
- Create: `app/src/components/Modal.test.tsx`

**Context:** Accessible dialog primitive built on `createPortal`. Overlay + sheet layout. ESC + overlay-click close. Focus trap + focus restore. Body-scroll lock while open. Centered card ≥640px; bottom sheet <640px. No animations.

- [ ] **Step 1: Write failing tests**

File: `app/src/components/Modal.test.tsx`

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("does not render children when open=false", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hi">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });

  it("renders children when open=true", () => {
    render(
      <Modal open onClose={() => {}} title="Hi">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Hi" })).toBeInTheDocument();
  });

  it("calls onClose on ESC", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on overlay click", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when sheet body is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>inside</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when close button (×) is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores on close", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Hi">
        <p>x</p>
      </Modal>,
    );
    expect(document.documentElement.style.overflow).toBe("hidden");
    rerender(
      <Modal open={false} onClose={() => {}} title="Hi">
        <p>x</p>
      </Modal>,
    );
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("moves focus into the sheet on open and restores to trigger on close", async () => {
    function Harness() {
      const [open, setOpen] = (
        require("react") as typeof import("react")
      ).useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>trigger</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Hi">
            <button>inside-button</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    await userEvent.click(trigger);
    // After open, focus should have moved off the trigger.
    expect(document.activeElement).not.toBe(trigger);
    // ESC to close; focus should return to trigger.
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/vorevault/app
npx vitest run src/components/Modal.test.tsx
```

Expected: FAIL — "Cannot find module './Modal'".

- [ ] **Step 3: Implement `Modal`**

File: `app/src/components/Modal.tsx`

```tsx
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md";
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, size = "md", children }: Props) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => { setMounted(true); }, []);

  // Body scroll lock.
  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = prev; };
  }, [open]);

  // ESC handler.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus management: save active element, move focus into sheet on open;
  // restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    if (sheet) {
      const focusable = sheet.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? sheet).focus();
    }
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Focus trap on Tab/Shift+Tab.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted || !open) return null;

  const sheetClass = size === "sm" ? styles.sheetSm : styles.sheetMd;

  return createPortal(
    <div className={styles.root}>
      <div
        data-testid="modal-overlay"
        className={styles.overlay}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${sheetClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={styles.closeBtn}
          >
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Implement `Modal.module.css`**

File: `app/src/components/Modal.module.css`

```css
.root {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--vv-ink) 40%, transparent);
}

.sheet {
  position: relative;
  background: var(--vv-bg-panel);
  border: 2px solid var(--vv-ink);
  box-shadow: var(--vv-shadow-lg);
  border-radius: var(--vv-radius-md);
  width: 100%;
  max-height: 85dvh;
  display: flex;
  flex-direction: column;
  outline: none;
}

.sheetSm { max-width: 480px; }
.sheetMd { max-width: 560px; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1.5px solid var(--vv-ink);
}

.title {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-weight: 700;
  font-size: 20px;
  color: var(--vv-ink);
  margin: 0;
}

.closeBtn {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  color: var(--vv-ink);
  cursor: pointer;
  padding: 0 4px;
}

.closeBtn:hover { color: var(--vv-accent); }

.body {
  padding: 18px;
  overflow: auto;
}

@media (max-width: 640px) {
  .root {
    align-items: flex-end;
  }
  .sheet {
    max-width: none;
    border-radius: var(--vv-radius-md) var(--vv-radius-md) 0 0;
    border-bottom: none;
    box-shadow: none;
    padding-bottom: max(0px, var(--vv-safe-bottom));
  }
  .sheetSm, .sheetMd { max-width: none; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /root/vorevault/app
npx vitest run src/components/Modal.test.tsx
```

Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/components/Modal.tsx app/src/components/Modal.module.css app/src/components/Modal.test.tsx
git commit -m "feat(ui): Modal primitive with focus trap and bottom-sheet mobile"
```

---

## Task 3: `NewFolderDialog`

**Files:**
- Create: `app/src/components/NewFolderDialog.tsx`
- Create: `app/src/components/NewFolderDialog.module.css`
- Create: `app/src/components/NewFolderDialog.test.tsx`

**Context:** Small `Modal`-based dialog for creating a folder at a specific parent. Already-existing `POST /api/folders` endpoint handles creation; 409 → "already exists" inline error.

- [ ] **Step 1: Write failing tests**

File: `app/src/components/NewFolderDialog.test.tsx`

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewFolderDialog } from "./NewFolderDialog";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("NewFolderDialog", () => {
  it("posts to /api/folders with correct parentId on Create click", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: "folder-1", name: "clips" }),
    });
    const onCreated = vi.fn();
    render(
      <NewFolderDialog
        open
        onClose={() => {}}
        parentId="p1"
        parentName="home"
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "clips");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/folders", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "clips", parentId: "p1" }),
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "folder-1", name: "clips" });
  });

  it("submits on Enter in the input", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: "f", name: "x" }),
    });
    const onCreated = vi.fn();
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId={null} parentName={null}
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "x{Enter}");
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("titles 'New folder in root' when parent is null", () => {
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId={null} parentName={null}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /new folder in root/i })).toBeInTheDocument();
  });

  it("titles 'New folder in <name>' when parent provided", () => {
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId="p" parentName=".ryan"
        onCreated={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /new folder in \.ryan/i })).toBeInTheDocument();
  });

  it("surfaces 409 conflict inline and stays open", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: "conflict", existingId: "abc" }),
    });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <NewFolderDialog
        open onClose={onClose} parentId="p1" parentName="home"
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "dup");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(screen.getByText(/already exists/i)).toBeInTheDocument(),
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables Create while request is in flight and re-enables after error", async () => {
    let resolveFn!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => { resolveFn = resolve; }),
    );
    render(
      <NewFolderDialog
        open onClose={() => {}} parentId={null} parentName={null}
        onCreated={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText(/folder name/i), "x");
    const createBtn = screen.getByRole("button", { name: /create/i });
    await userEvent.click(createBtn);
    expect(createBtn).toBeDisabled();
    resolveFn({
      ok: false, status: 500,
      json: async () => ({ error: "oops" }),
    });
    await waitFor(() => expect(createBtn).not.toBeDisabled());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/vorevault/app
npx vitest run src/components/NewFolderDialog.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `NewFolderDialog`**

File: `app/src/components/NewFolderDialog.tsx`

```tsx
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import styles from "./NewFolderDialog.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  parentId: string | null;
  parentName: string | null;
  onCreated: (folder: { id: string; name: string }) => void;
};

export function NewFolderDialog({
  open, onClose, parentId, parentName, onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = parentName
    ? `New folder in ${parentName}`
    : "New folder in root";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, parentId }),
      });
      if (res.status === 201 || res.ok) {
        const folder = await res.json();
        setName("");
        onCreated(folder);
        onClose();
      } else if (res.status === 409) {
        setError(`A folder named "${trimmed}" already exists here.`);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(`Create failed: ${(body as { error?: string }).error ?? res.statusText}`);
      }
    } catch (err) {
      setError(`Create failed: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Folder name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className={styles.input}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0}
            className={styles.create}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Implement `NewFolderDialog.module.css`**

File: `app/src/components/NewFolderDialog.module.css`

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--vv-ink-muted);
}

.input {
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-panel);
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--vv-ink);
  border-radius: var(--vv-radius-sm);
}

.input:focus {
  outline: 2px solid var(--vv-accent);
  outline-offset: 1px;
}

.error {
  color: var(--vv-danger);
  font-size: 13px;
  margin: 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.cancel,
.create {
  border: 1.5px solid var(--vv-ink);
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
}

.cancel {
  background: var(--vv-bg);
  color: var(--vv-ink);
}

.create {
  background: var(--vv-accent);
  color: #fff;
}

.create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel:hover,
.create:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /root/vorevault/app
npx vitest run src/components/NewFolderDialog.test.tsx
```

Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/components/NewFolderDialog.tsx app/src/components/NewFolderDialog.module.css app/src/components/NewFolderDialog.test.tsx
git commit -m "feat(ui): NewFolderDialog — Modal-based folder creation"
```

---

## Task 4: `NewFolderButton` + wire into main page

**Files:**
- Create: `app/src/components/NewFolderButton.tsx`
- Create: `app/src/components/NewFolderButton.module.css`
- Modify: `app/src/app/page.tsx`
- Modify: `app/src/app/page.module.css`

**Context:** Client-component button that owns its own dialog state. On successful create, calls `router.refresh()` so the server-rendered main page re-fetches folders.

- [ ] **Step 1: Implement `NewFolderButton`**

File: `app/src/components/NewFolderButton.tsx`

```tsx
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
```

- [ ] **Step 2: Implement `NewFolderButton.module.css`**

File: `app/src/components/NewFolderButton.module.css`

```css
.btn {
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-panel);
  color: var(--vv-ink);
  padding: 4px 10px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow);
  background: var(--vv-warn);
}
```

- [ ] **Step 3: Add button to main page "Folders" header**

Modify: `app/src/app/page.tsx`

Change import block:
```tsx
import { FolderTile } from "@/components/FolderTile";
import { NewFolderButton } from "@/components/NewFolderButton";
import { Pill } from "@/components/Pill";
```

Replace the folders section (`{!mineOnly && (...)}` block) with:
```tsx
{!mineOnly && (
  <section className={styles.foldersSection}>
    <div className={styles.foldersHeader}>
      <h2 className={styles.sectionLabel}>Folders</h2>
      <NewFolderButton parentId={null} parentName={null} />
    </div>
    {folders.length === 0 ? (
      <p className={styles.foldersEmpty}>
        No folders yet. Create one with the + New folder button above.
      </p>
    ) : (
      <div className={styles.folderGrid}>
        {folders.map((f) => (
          <FolderTile key={f.id} id={f.id} name={f.name}
            fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count} />
        ))}
      </div>
    )}
  </section>
)}
```

- [ ] **Step 4: Add `.foldersHeader` style**

Modify: `app/src/app/page.module.css` — append within the `.foldersSection` area (before the `@media` block):

```css
.foldersHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.foldersHeader .sectionLabel {
  margin: 0;
  flex: 1;
}
```

Inside the existing mobile media block (`@media (max-width: 640px)`), add:

```css
.foldersHeader {
  padding: 0 0 0 0;
}
```

(Already fine because foldersSection sets horizontal padding. This entry is a no-op placeholder; skip it if linting complains.)

- [ ] **Step 5: Manual verify**

```bash
cd /root/vorevault/app
npm run dev
```

Load `http://localhost:3000/`. Check:
- "+ New folder" button visible next to "Folders" label.
- Click opens dialog with title "New folder in root".
- Typing a name + Create creates a folder; page refreshes; new folder appears in grid.
- Creating a duplicate shows inline "already exists" error and dialog stays open.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/components/NewFolderButton.tsx app/src/components/NewFolderButton.module.css app/src/app/page.tsx app/src/app/page.module.css
git commit -m "feat(ui): NewFolderButton on main page Folders header"
```

---

## Task 5: Wire `NewFolderButton` into folder detail page

**Files:**
- Modify: `app/src/app/d/[id]/page.tsx`
- Modify: `app/src/app/d/[id]/page.module.css`

**Context:** Folder detail page should get a matching "+ New folder" button in its header so users can create subfolders in place.

- [ ] **Step 1: Read current `d/[id]/page.tsx` to find the folder-name header**

```bash
cat app/src/app/d/[id]/page.tsx
```

Locate the `<h1>` (or equivalent) that renders the current folder's name.

- [ ] **Step 2: Import `NewFolderButton` and render it in the header**

Modify: `app/src/app/d/[id]/page.tsx`

Add import:
```tsx
import { NewFolderButton } from "@/components/NewFolderButton";
```

Wrap the folder-name header in a `.folderHeader` flex container with the button next to it:
```tsx
<div className={styles.folderHeader}>
  <h1 className={styles.folderTitle}>{folder.name}</h1>
  <NewFolderButton parentId={folder.id} parentName={folder.name} />
</div>
```

(If the current page uses `<h1 className={styles.name}>{folder.name}</h1>` without a wrapper, keep the existing class on the h1 and add the new `.folderHeader` wrapper class.)

- [ ] **Step 3: Add `.folderHeader` style**

Modify: `app/src/app/d/[id]/page.module.css` — add near top:

```css
.folderHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: Manual verify**

Restart dev server if needed. Navigate to a folder detail page (click any folder tile from main). Check:
- "+ New folder" button visible next to folder name.
- Click → dialog title reads `New folder in "<folder name>"`.
- Create a subfolder; page refreshes; subfolder appears in that folder's grid.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/app/d/[id]/page.tsx app/src/app/d/[id]/page.module.css
git commit -m "feat(ui): NewFolderButton on folder detail page"
```

---

## Task 6: `FolderPickerModal` body component

**Files:**
- Create: `app/src/components/FolderPickerModal.tsx`
- Create: `app/src/components/FolderPickerModal.module.css`
- Create: `app/src/components/FolderPickerModal.test.tsx`

**Context:** Drill-down body component to live inside a `<Modal>`. Fetches the full folder tree once (from existing `GET /api/folders/tree`) and pivots to show only the current level's children. Breadcrumbs for navigation. Inline create (same `POST /api/folders` endpoint). Exposes `onCancel`/`onSelect` so the consumer controls modal open state.

- [ ] **Step 1: Write failing tests**

File: `app/src/components/FolderPickerModal.test.tsx`

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderPickerModal } from "./FolderPickerModal";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

function mockTree() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      folders: [
        { id: "r1", name: ".ryan", parent_id: null },
        { id: "r1-a", name: "clips", parent_id: "r1" },
        { id: "r1-b", name: "screenshots", parent_id: "r1" },
        { id: "r2", name: "shared", parent_id: null },
      ],
    }),
  });
}

describe("FolderPickerModal", () => {
  it("drill-down: shows top-level folders at Home, tapping drills in", async () => {
    mockTree();
    render(
      <FolderPickerModal
        initialFolderId={null}
        onCancel={() => {}}
        onSelect={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    expect(screen.getByText("shared")).toBeInTheDocument();

    await userEvent.click(screen.getByText(".ryan"));
    // Now showing children of .ryan
    expect(screen.getByText("clips")).toBeInTheDocument();
    expect(screen.getByText("screenshots")).toBeInTheDocument();
    expect(screen.queryByText("shared")).not.toBeInTheDocument();
  });

  it("breadcrumb: tapping Home returns to root level", async () => {
    mockTree();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByText(".ryan"));
    await userEvent.click(screen.getByRole("button", { name: /home/i }));
    expect(screen.getByText("shared")).toBeInTheDocument();
  });

  it("Select fires onSelect with current level's folder id", async () => {
    mockTree();
    const onSelect = vi.fn();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={onSelect} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByText(".ryan"));
    await userEvent.click(screen.getByRole("button", { name: /^select$/i }));
    expect(onSelect).toHaveBeenCalledWith("r1");
  });

  it("Select from Home fires onSelect(null)", async () => {
    mockTree();
    const onSelect = vi.fn();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={onSelect} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^select$/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("Cancel fires onCancel without selecting", async () => {
    mockTree();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={onCancel} onSelect={onSelect} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("inline create: on 201, new folder appears and becomes current level", async () => {
    mockTree();
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: "new1", name: "fresh" }),
    });
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /create folder here/i }));
    const input = await screen.findByLabelText(/new folder name/i);
    await userEvent.type(input, "fresh{Enter}");
    await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());
    // Drill-down after create: now at "fresh" level with no children yet
    expect(screen.queryByText(".ryan")).not.toBeInTheDocument();
  });

  it("inline create 409: surfaces 'use existing' action", async () => {
    mockTree();
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: "conflict", existingId: "r2" }),
    });
    render(
      <FolderPickerModal initialFolderId={null}
        onCancel={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(".ryan")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /create folder here/i }));
    await userEvent.type(screen.getByLabelText(/new folder name/i), "shared{Enter}");
    await waitFor(() =>
      expect(screen.getByText(/already exists/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /use existing/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/vorevault/app
npx vitest run src/components/FolderPickerModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FolderPickerModal`**

File: `app/src/components/FolderPickerModal.tsx`

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./FolderPickerModal.module.css";

type Node = { id: string; name: string; parent_id: string | null };

type Props = {
  initialFolderId: string | null;
  onCancel: () => void;
  onSelect: (folderId: string | null) => void;
};

type ConflictError = { kind: "conflict"; name: string; existingId: string };
type OtherError = { kind: "other"; message: string };
type CreateError = ConflictError | OtherError;

export function FolderPickerModal({ initialFolderId, onCancel, onSelect }: Props) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // currentId: the current-level folder (null = root). Select picks this.
  const [currentId, setCurrentId] = useState<string | null>(initialFolderId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<CreateError | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/folders/tree")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setNodes(d.folders ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError((err as Error).message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Node>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const breadcrumb = useMemo(() => {
    const crumbs: Array<{ id: string | null; name: string }> = [
      { id: null, name: "Home" },
    ];
    let cursor: string | null = currentId;
    const path: Node[] = [];
    while (cursor) {
      const node = byId.get(cursor);
      if (!node) break;
      path.unshift(node);
      cursor = node.parent_id;
    }
    for (const n of path) crumbs.push({ id: n.id, name: n.name });
    return crumbs;
  }, [currentId, byId]);

  const children = useMemo(
    () => nodes.filter((n) => n.parent_id === currentId),
    [nodes, currentId],
  );

  function openCreate() {
    setCreating(true);
    setNewName("");
    setCreateError(null);
  }

  function closeCreate() {
    setCreating(false);
    setNewName("");
    setCreateError(null);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, parentId: currentId }),
      });
      if (res.ok || res.status === 201) {
        const folder = await res.json();
        const node: Node = {
          id: folder.id, name: folder.name, parent_id: currentId,
        };
        setNodes((prev) => [...prev, node]);
        setCurrentId(folder.id);
        closeCreate();
      } else if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setCreateError({
          kind: "conflict",
          name: trimmed,
          existingId: (body as { existingId?: string }).existingId ?? "",
        });
      } else {
        const body = await res.json().catch(() => ({}));
        setCreateError({
          kind: "other",
          message: (body as { error?: string }).error ?? res.statusText,
        });
      }
    } catch (err) {
      setCreateError({ kind: "other", message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  function useExisting(existingId: string) {
    setCurrentId(existingId);
    closeCreate();
  }

  if (loading) return <p className={styles.loading}>Loading folders…</p>;
  if (fetchError) return <p className={styles.error}>Couldn&apos;t load folders: {fetchError}</p>;

  return (
    <div className={styles.picker}>
      <nav className={styles.breadcrumbs} aria-label="Folder path">
        {breadcrumb.map((c, i) => (
          <span key={c.id ?? "root"} className={styles.crumb}>
            <button
              type="button"
              onClick={() => setCurrentId(c.id)}
              className={styles.crumbBtn}
              aria-current={i === breadcrumb.length - 1 ? "page" : undefined}
            >
              {c.name}
            </button>
            {i < breadcrumb.length - 1 && <span className={styles.crumbSep}>/</span>}
          </span>
        ))}
      </nav>

      <ul className={styles.list}>
        {children.length === 0 && !creating && (
          <li className={styles.empty}>No subfolders here.</li>
        )}
        {children.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setCurrentId(c.id)}
              className={styles.row}
            >
              <span className={styles.rowIcon} aria-hidden="true">📁</span>
              <span className={styles.rowName}>{c.name}</span>
              <span className={styles.rowArrow} aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>

      {!creating && (
        <button
          type="button"
          onClick={openCreate}
          className={styles.createBtn}
        >
          + Create folder here
        </button>
      )}

      {creating && (
        <form onSubmit={submitCreate} className={styles.createForm}>
          <label className={styles.createLabel}>
            New folder name
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              className={styles.createInput}
            />
          </label>
          {createError?.kind === "conflict" && (
            <div className={styles.createError}>
              <span>A folder named &ldquo;{createError.name}&rdquo; already exists here.</span>
              {createError.existingId && (
                <button
                  type="button"
                  onClick={() => useExisting(createError.existingId)}
                  className={styles.useExistingBtn}
                >
                  Use existing
                </button>
              )}
            </div>
          )}
          {createError?.kind === "other" && (
            <p className={styles.createError}>Create failed: {createError.message}</p>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              onClick={closeCreate}
              className={styles.createCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || newName.trim().length === 0}
              className={styles.createSubmit}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      <footer className={styles.footer}>
        <button type="button" onClick={onCancel} className={styles.footerCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentId)}
          className={styles.footerSelect}
        >
          Select
        </button>
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Implement `FolderPickerModal.module.css`**

File: `app/src/components/FolderPickerModal.module.css`

```css
.picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}

.loading, .error {
  font-size: 13px;
  color: var(--vv-ink-muted);
  font-style: italic;
  margin: 0;
}

.breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 13px;
  color: var(--vv-ink-muted);
  font-family: var(--vv-font-display);
  font-style: italic;
}

.crumb { display: inline-flex; align-items: center; }

.crumbBtn {
  background: transparent;
  border: none;
  font: inherit;
  color: var(--vv-accent);
  cursor: pointer;
  padding: 2px 4px;
}

.crumbBtn[aria-current="page"] {
  color: var(--vv-ink);
  font-weight: 700;
}

.crumbSep { margin: 0 2px; color: var(--vv-ink-subtle); }

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: var(--vv-bg);
  border: 1.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-sm);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  color: var(--vv-ink);
  cursor: pointer;
}

.row:hover {
  background: var(--vv-warn);
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow-sm);
}

.rowIcon { font-size: 16px; }
.rowName { flex: 1; }
.rowArrow { color: var(--vv-ink-muted); font-size: 16px; }

.empty {
  font-size: 13px;
  color: var(--vv-ink-muted);
  font-style: italic;
  padding: 6px 2px;
}

.createBtn {
  align-self: flex-start;
  background: transparent;
  border: 1.5px dashed var(--vv-ink-muted);
  color: var(--vv-ink-muted);
  padding: 6px 12px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
}

.createBtn:hover {
  color: var(--vv-ink);
  border-color: var(--vv-ink);
}

.createForm {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--vv-bg);
  border: 1.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-sm);
  padding: 12px;
}

.createLabel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--vv-ink-muted);
}

.createInput {
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-panel);
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--vv-ink);
  border-radius: var(--vv-radius-sm);
}

.createInput:focus {
  outline: 2px solid var(--vv-accent);
  outline-offset: 1px;
}

.createError {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--vv-danger);
  font-size: 13px;
  margin: 0;
}

.useExistingBtn {
  background: var(--vv-bg-panel);
  color: var(--vv-ink);
  border: 1.5px solid var(--vv-ink);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
}

.createActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.createCancel,
.createSubmit {
  border: 1.5px solid var(--vv-ink);
  padding: 6px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
}

.createCancel { background: var(--vv-bg); color: var(--vv-ink); }
.createSubmit { background: var(--vv-accent); color: #fff; }
.createSubmit:disabled { opacity: 0.5; cursor: not-allowed; }

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 12px;
  border-top: 1.5px solid var(--vv-ink);
  margin-top: auto;
}

.footerCancel,
.footerSelect {
  border: 1.5px solid var(--vv-ink);
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
}

.footerCancel { background: var(--vv-bg); color: var(--vv-ink); }
.footerSelect { background: var(--vv-accent); color: #fff; }

.footerCancel:hover,
.footerSelect:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow);
}

@media (max-width: 640px) {
  .list { max-height: 50dvh; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /root/vorevault/app
npx vitest run src/components/FolderPickerModal.test.tsx
```

Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/components/FolderPickerModal.tsx app/src/components/FolderPickerModal.module.css app/src/components/FolderPickerModal.test.tsx
git commit -m "feat(ui): FolderPickerModal drill-down body component"
```

---

## Task 7: Rewrite `FolderPicker` trigger (same external API, new UX)

**Files:**
- Modify: `app/src/components/FolderPicker.tsx` (rewrite body)
- Modify: `app/src/components/FolderPicker.module.css` (rewrite)

**Context:** External API stays `<FolderPicker value onChange />`. Internals become: trigger button showing current selection name + open modal on click; modal contains `<FolderPickerModal>` body. Callers (`UploadClient`, `FileActions`) require **no change**.

- [ ] **Step 1: Rewrite `FolderPicker.tsx`**

File: `app/src/components/FolderPicker.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { FolderPickerModal } from "./FolderPickerModal";
import styles from "./FolderPicker.module.css";

type Props = {
  value: string | null;
  onChange: (folderId: string | null) => void;
};

export function FolderPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Resolve the display name for `value` without holding a full tree
  // in this component. The tree is already loaded inside the picker;
  // here we just fetch the minimal info needed to label the trigger.
  useEffect(() => {
    if (!value) { setSelectedName(null); return; }
    let cancelled = false;
    fetch("/api/folders/tree")
      .then((r) => r.json())
      .then((d: { folders?: Array<{ id: string; name: string }> }) => {
        if (cancelled) return;
        const node = (d.folders ?? []).find((n) => n.id === value);
        setSelectedName(node?.name ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value]);

  const label = value
    ? `Folder: ${selectedName ?? "…"}`
    : "Folder: None (root)";

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        <span className={styles.triggerIcon} aria-hidden="true">📁</span>
        <span className={styles.triggerLabel}>{label}</span>
        <span className={styles.triggerCaret} aria-hidden="true">›</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose folder"
        size="md"
      >
        <FolderPickerModal
          initialFolderId={value}
          onCancel={() => setOpen(false)}
          onSelect={(folderId) => {
            onChange(folderId);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `FolderPicker.module.css`**

File: `app/src/components/FolderPicker.module.css`

```css
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--vv-bg-panel);
  border: 1.5px solid var(--vv-ink);
  color: var(--vv-ink);
  padding: 8px 14px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
}

.trigger:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow);
  background: var(--vv-warn);
}

.triggerIcon { font-size: 16px; }
.triggerLabel { flex: 1; text-align: left; }
.triggerCaret { color: var(--vv-ink-muted); }
```

- [ ] **Step 3: Run all component tests**

```bash
cd /root/vorevault/app
npx vitest run src/components
```

Expected: PASS — all Modal, NewFolderDialog, FolderPickerModal tests still green.

- [ ] **Step 4: Manual regression check — upload flow**

```bash
cd /root/vorevault/app
npm run dev
```

Navigate to `/upload`:
- Click the Folder trigger button → modal opens with tree.
- Drill, pick a folder, click Select → trigger updates to show that folder name.
- Drop a file → it should upload into the chosen folder.

- [ ] **Step 5: Manual regression check — file move flow**

Navigate to a file detail page `/f/<id>`:
- Click "Move" → the move panel shows the Folder trigger button.
- Click it → modal opens.
- Pick a folder, click Select → trigger updates.
- Click "Save" → file moves. Navigate back to confirm it lives in the new folder.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/components/FolderPicker.tsx app/src/components/FolderPicker.module.css
git commit -m "refactor(ui): FolderPicker uses Modal + FolderPickerModal"
```

---

## Task 8: Tokenize `SearchBar` + add `variant` prop

**Files:**
- Modify: `app/src/components/SearchBar.tsx`
- Modify: `app/src/components/SearchBar.module.css`

**Context:** Replace hardcoded `#222`, `#faf4e6`, `#fff` with design tokens. Add `variant: "inline" | "overlay"` prop. Default `"inline"` keeps the existing appearance; `"overlay"` is used by the mobile search overlay (larger input, no shadow).

- [ ] **Step 1: Rewrite `SearchBar.tsx` with `variant` prop**

File: `app/src/components/SearchBar.tsx`

Add prop and wire `autoFocus` + the right CSS class:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./SearchBar.module.css";

type Hit = { type: "folder" | "file"; id: string; name: string };

type Props = {
  variant?: "inline" | "overlay";
  autoFocus?: boolean;
  onHitSelected?: () => void;
};

export function SearchBar({
  variant = "inline",
  autoFocus = false,
  onHitSelected,
}: Props = {}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`);
      if (!res.ok) return;
      const body = await res.json();
      setHits([
        ...body.folders.map((f: { id: string; name: string }) => ({ type: "folder" as const, id: f.id, name: f.name })),
        ...body.files.map((f: { id: string; original_name: string }) => ({ type: "file" as const, id: f.id, name: f.original_name })),
      ]);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      onHitSelected?.();
    }
  }

  const formClass = variant === "overlay" ? styles.formOverlay : styles.formInline;
  const inputClass = variant === "overlay" ? styles.inputOverlay : styles.inputInline;
  const dropdownClass = variant === "overlay" ? styles.dropdownOverlay : styles.dropdownInline;

  return (
    <form onSubmit={onSubmit} className={`${styles.form} ${formClass}`} role="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="search files, folders, uploaders…"
        className={`${styles.input} ${inputClass}`}
        aria-label="Search"
        autoFocus={autoFocus}
      />
      {open && hits.length > 0 && (
        <ul className={`${styles.dropdown} ${dropdownClass}`} role="listbox">
          {hits.map((h) => (
            <li key={`${h.type}-${h.id}`}>
              <Link
                href={h.type === "folder" ? `/d/${h.id}` : `/f/${h.id}`}
                onClick={() => onHitSelected?.()}
              >
                <span className={styles.kind}>{h.type}</span> {h.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Rewrite `SearchBar.module.css` with tokens + variants**

File: `app/src/components/SearchBar.module.css`

```css
.form {
  position: relative;
}

.formInline {
  flex: 1;
  max-width: 480px;
}

.formOverlay {
  width: 100%;
  flex: 1;
}

.input {
  width: 100%;
  font-family: inherit;
  color: var(--vv-ink);
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-panel);
}

.input:focus {
  outline: 2px solid var(--vv-accent);
  outline-offset: 1px;
}

.inputInline {
  padding: 7px 12px;
  font-size: 14px;
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
}

.inputOverlay {
  padding: 12px 14px;
  font-size: 16px;
  border-radius: var(--vv-radius-sm);
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--vv-bg-panel);
  border: 2px solid var(--vv-ink);
  list-style: none;
  margin: 2px 0 0;
  padding: 6px;
  z-index: 20;
  max-height: 300px;
  overflow: auto;
  border-radius: var(--vv-radius-sm);
}

.dropdownInline { box-shadow: var(--vv-shadow); }
.dropdownOverlay {
  box-shadow: none;
  max-height: none;
  border-left: none;
  border-right: none;
  margin: 0;
  border-radius: 0;
}

.dropdown li a {
  display: block;
  padding: 8px 6px;
  color: var(--vv-ink);
  text-decoration: none;
}

.dropdown li a:hover { background: var(--vv-warn); }

.kind {
  font-family: var(--vv-font-display);
  font-style: italic;
  color: var(--vv-ink-muted);
  margin-right: 6px;
}
```

- [ ] **Step 3: Type-check + existing tests**

```bash
cd /root/vorevault/app
npx tsc --noEmit
npx vitest run
```

Expected: no type errors; all tests still green.

- [ ] **Step 4: Manual verify**

`npm run dev`. Visit `/`. Search bar in TopBar should now match the rest of the aesthetic (cream bg, dark border, hard shadow). Dropdown hits should also have the shadow.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/components/SearchBar.tsx app/src/components/SearchBar.module.css
git commit -m "refactor(ui): tokenize SearchBar, add overlay variant"
```

---

## Task 9: `TopBar` mobile search overlay

**Files:**
- Modify: `app/src/components/TopBar.tsx`
- Modify: `app/src/components/TopBar.module.css`

**Context:** On mobile, replace the inline SearchBar with a 🔍 icon button. Tapping it opens a full-viewport search overlay (not using the Modal primitive — different visual treatment). Overlay contains `[× close] [SearchBar variant="overlay" autoFocus]` and hits take the rest.

- [ ] **Step 1: Rewrite `TopBar.tsx`**

File: `app/src/components/TopBar.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { MooseLogo } from "./MooseLogo";
import { Pill } from "./Pill";
import { UserChip } from "./UserChip";
import { SearchBar } from "./SearchBar";
import styles from "./TopBar.module.css";

export function TopBar({
  username,
  avatarUrl,
  showUpload = true,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  showUpload?: boolean;
  isAdmin?: boolean;
}) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileSearchOpen]);

  return (
    <>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <MooseLogo size="header" />
          vorevault
        </a>
        <div className={styles.searchDesktop}>
          <SearchBar variant="inline" />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.searchIconBtn}
            aria-label="Open search"
            onClick={() => setMobileSearchOpen(true)}
          >
            <span aria-hidden="true">🔍</span>
          </button>
          {showUpload && (
            <Pill
              variant="primary"
              href="/upload"
              className={styles.uploadPill}
              aria-label="Upload"
            >
              <span className={styles.uploadIcon} aria-hidden="true">↑</span>
              <span className={styles.uploadLabel}>Upload</span>
            </Pill>
          )}
          <UserChip username={username} avatarUrl={avatarUrl} isAdmin={isAdmin} />
        </div>
      </header>

      {mobileSearchOpen && (
        <div
          className={styles.searchOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className={styles.searchOverlayHeader}>
            <button
              type="button"
              className={styles.searchOverlayClose}
              aria-label="Close search"
              onClick={() => setMobileSearchOpen(false)}
            >
              ×
            </button>
            <SearchBar
              variant="overlay"
              autoFocus
              onHitSelected={() => setMobileSearchOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Rewrite `TopBar.module.css`**

File: `app/src/components/TopBar.module.css`

```css
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 32px;
  border-bottom: 2px solid var(--vv-ink);
  background: var(--vv-bg);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  font-family: var(--vv-font-display);
  font-style: italic;
  font-weight: 900;
  font-size: 28px;
  color: var(--vv-accent);
  letter-spacing: -1px;
  line-height: 1;
  text-decoration: none;
}

.brand:hover { text-decoration: none; }

.searchDesktop { display: flex; flex: 1; }

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.searchIconBtn {
  display: none;
  width: 44px;
  height: 44px;
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-panel);
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.searchIconBtn:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow);
  background: var(--vv-warn);
}

.uploadPill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.uploadIcon {
  display: inline-block;
  font-weight: 900;
}

.searchOverlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--vv-bg);
  display: flex;
  flex-direction: column;
}

.searchOverlayHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 2px solid var(--vv-ink);
}

.searchOverlayClose {
  width: 44px;
  height: 44px;
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-panel);
  border-radius: var(--vv-radius-sm);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .topbar {
    padding: 12px 16px;
  }

  .brand {
    font-size: 22px;
    gap: 8px;
  }

  .searchDesktop {
    display: none;
  }

  .searchIconBtn {
    display: inline-flex;
  }

  .actions { gap: 10px; }

  .uploadPill {
    padding: 0;
    width: 44px;
    height: 44px;
    justify-content: center;
  }

  .uploadLabel { display: none; }
}

@media (min-width: 641px) {
  .searchIconBtn { display: none; }
  .searchOverlay { display: none; }
}
```

- [ ] **Step 3: Type-check + tests**

```bash
cd /root/vorevault/app
npx tsc --noEmit
npx vitest run
```

Expected: no type errors; all tests still green.

- [ ] **Step 4: Manual verify on mobile viewport**

`npm run dev`. Chrome devtools → device toolbar → 375×667. Visit `/`:
- Search bar in TopBar is gone.
- 🔍 icon button visible.
- Tap icon → full-screen overlay appears with autofocused input.
- Type 2+ chars → dropdown hits appear.
- Tap a hit → navigates and overlay closes.
- Tap `×` or press ESC → overlay closes.

Desktop viewport (1200px): inline SearchBar visible; 🔍 icon hidden.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/components/TopBar.tsx app/src/components/TopBar.module.css
git commit -m "feat(ui): TopBar collapses search to icon+overlay on mobile"
```

---

## Task 10: `FolderTile` polish

**Files:**
- Modify: `app/src/components/FolderTile.tsx` (no code change needed; verify)
- Modify: `app/src/components/FolderTile.module.css`

**Context:** Add hover shadow-shift matching FileCard, ensure mobile tap target ≥64px tall, tokenize any hardcoded colors.

- [ ] **Step 1: Read current `FolderTile.module.css`**

```bash
cat app/src/components/FolderTile.module.css
```

- [ ] **Step 2: Rewrite `FolderTile.module.css` for consistency**

File: `app/src/components/FolderTile.module.css`

```css
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 2px solid var(--vv-ink);
  background: var(--vv-bg-panel);
  color: var(--vv-ink);
  padding: 14px 16px;
  border-radius: var(--vv-radius-sm);
  box-shadow: var(--vv-shadow-sm);
  text-decoration: none;
  min-height: 64px;
  justify-content: center;
}

.tile:hover {
  transform: translate(-1px, -1px);
  box-shadow: var(--vv-shadow);
  background: var(--vv-warn);
  text-decoration: none;
}

.name {
  font-family: var(--vv-font-display);
  font-style: italic;
  font-weight: 700;
  font-size: 18px;
}

.counts {
  font-size: 12px;
  color: var(--vv-ink-muted);
  font-family: var(--vv-font-mono);
}

@media (max-width: 640px) {
  .tile {
    min-height: 72px;
    padding: 14px 16px;
  }
  .name { font-size: 17px; }
}
```

- [ ] **Step 3: Manual verify**

`npm run dev`. Visit `/`. Folder tiles now have a hard shadow; hovering shifts the shadow. Mobile: tiles are larger.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/FolderTile.module.css
git commit -m "style(ui): FolderTile hover + mobile tap-target polish"
```

---

## Task 11: Audit pass — `/search` page tokenization

**Files:**
- Modify: `app/src/app/search/page.module.css`

**Context:** Replace any hardcoded colors with tokens; match main page spacing and section-label styling.

- [ ] **Step 1: Read current search page CSS**

```bash
cat app/src/app/search/page.module.css
```

Identify any hardcoded colors (e.g., `#222`, `#faf4e6`, hardcoded greys), inconsistent spacing vs `app/src/app/page.module.css`.

- [ ] **Step 2: Rewrite hardcoded colors to tokens**

Replace:
- `#222` / `#2a1810` → `var(--vv-ink)`
- `#faf4e6` / `#f4ead5` → `var(--vv-bg-panel)` or `var(--vv-bg)` (pick per context — background of page is `--vv-bg`, card-like surfaces are `--vv-bg-panel`)
- `#fff` → `var(--vv-bg-panel)`
- `#555` / `#666` / greys → `var(--vv-ink-muted)`
- `#b8a07a` → `var(--vv-ink-subtle)`

For spacing, ensure:
- Page horizontal padding `32px` on desktop, `16px` on <640px.
- Section labels use the `.sectionLabel` pattern from main page: Fraunces italic 14px, uppercase, 0.04em letter-spacing, bottom border.

**No code change required** unless the page.tsx is also emitting inline styles. Check `app/src/app/search/page.tsx` briefly:

```bash
grep -n "style=" app/src/app/search/page.tsx || true
```

If any inline styles reference colors, move them into the module CSS with tokens.

- [ ] **Step 3: Manual verify**

`npm run dev`. Search for a term → visit `/search?q=…`. Layout should visually match `/` — same side padding, same section-label feel, no stray greys.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/search/page.module.css app/src/app/search/page.tsx 2>/dev/null || git add app/src/app/search/page.module.css
git commit -m "style(ui): tokenize /search page"
```

---

## Task 12: Audit pass — `/d/[id]` folder detail tokenization

**Files:**
- Modify: `app/src/app/d/[id]/page.module.css`
- Possibly modify: `app/src/app/d/[id]/page.tsx` if inline styles present

**Context:** Ensure folder detail page header matches main page subheader pattern: folder name in Fraunces italic 36px (26px on mobile). Consistent side padding.

- [ ] **Step 1: Read current files**

```bash
cat app/src/app/d/[id]/page.module.css
cat app/src/app/d/[id]/page.tsx
```

- [ ] **Step 2: Update module CSS**

Ensure the folder detail header uses the same conventions as main page:
- `.folderTitle` (or whatever the current class is): `font-family: var(--vv-font-display)`, `font-style: italic`, `font-size: 36px`, `font-weight: 400`, `line-height: 1.1`, `letter-spacing: -1px`.
- `@media (max-width: 640px)`: `.folderTitle { font-size: 26px; }` + page padding `16px` horizontal.
- Replace any hardcoded colors with tokens (same mapping as Task 11).

Verify the `.folderHeader` flex wrapper added in Task 5 is still styled correctly after cleanup.

- [ ] **Step 3: Manual verify**

`npm run dev`. Visit a folder detail page. Compare to main page: same font feel for the page heading, same horizontal padding, New folder button in top-right.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/d/[id]/page.module.css app/src/app/d/[id]/page.tsx
git commit -m "style(ui): tokenize /d/[id] folder detail page"
```

---

## Task 13: Audit pass — `/f/[id]` file detail tokenization

**Files:**
- Modify: `app/src/app/f/[id]/page.module.css`
- Modify: `app/src/app/f/[id]/FileActions.module.css`

**Context:** Verify these CSS files use tokens throughout. Back link and meta panel spacing should match rest of app.

- [ ] **Step 1: Read current files**

```bash
cat app/src/app/f/[id]/page.module.css
cat app/src/app/f/[id]/FileActions.module.css
```

- [ ] **Step 2: Update module CSS**

Replace any hardcoded colors with tokens (same mapping as Task 11). Verify:
- `.back` link uses `var(--vv-accent)` and `var(--vv-ink-muted)` rather than raw hex.
- `.title`, `.by`, `.banner`, `.processing`, `.failed` all use tokens.
- `.player`, `.audio`, `.image` backgrounds use `var(--vv-ink)` (they already should; verify).

Check `FileActions.module.css` for `.error` using `var(--vv-danger)` (already done per earlier work).

- [ ] **Step 3: Manual verify**

Visit any `/f/<id>`. Compare spacing to main page. Hover the "back to vault" link — accent color. Banners (transcode pending/failed) should render with tokens.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/app/f/[id]/page.module.css app/src/app/f/[id]/FileActions.module.css
git commit -m "style(ui): tokenize /f/[id] file detail page"
```

---

## Task 14: Full mobile QA + type-check + full test run

**Files:** none — verification only.

**Context:** Per CLAUDE.md, "Before claiming work is done: run npm test, build the docker image, hit /api/health." Also: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete."

- [ ] **Step 1: Type-check**

```bash
cd /root/vorevault/app
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Full test run**

```bash
cd /root/vorevault/app
npm test
```

Expected: all tests pass, including the 3 new component test files.

- [ ] **Step 3: Lint**

```bash
cd /root/vorevault/app
npm run lint
```

Expected: no errors. Fix any the pass introduced.

- [ ] **Step 4: Production build locally**

```bash
cd /root/vorevault/app
npm run build
```

Expected: build succeeds. No "Next.js build worker exited" errors. No unused imports, no type errors.

- [ ] **Step 5: Browser QA — desktop (1200×800)**

`npm run dev`. Walk through:
- `/` — TopBar consistent, "+ New folder" button visible next to "Folders" label, search bar matches aesthetic.
- Create a folder from main → appears in grid.
- Click a folder → `/d/[id]` header matches main page style; "+ New folder" button visible.
- `/upload` — FolderPicker trigger button opens the modal; drill-down works; create-inline works.
- `/f/[id]` — rename + move still work (move uses the same modal).
- `/search?q=…` — layout matches main page.

- [ ] **Step 6: Browser QA — mobile (375×667)**

Chrome devtools → device toolbar. Walk through the same flows:
- TopBar shows 🔍 icon; tapping opens full-screen overlay.
- Modal opens as bottom sheet.
- Tap targets all ≥44px (visually: no squished buttons).
- Folder tile min-height comfortable.
- No horizontal scroll anywhere.

- [ ] **Step 7: Push branch and open PR**

```bash
cd /root/vorevault
git push -u origin feat/ui-consistency-pass
gh pr create --title "feat(ui): consistency pass + folder creation UX" --body "$(cat <<'EOF'
## Summary
- New `Modal` primitive (overlay + sheet, focus trap, bottom-sheet on mobile).
- `FolderPickerModal` replaces the inline tree dropdown with drill-down UX (breadcrumbs + current-level children, inline create).
- `FolderPicker` external API unchanged; internally uses trigger-button + Modal. Upload + Move flows get the new UX for free.
- `NewFolderButton` + `NewFolderDialog` on main page and folder detail pages.
- `TopBar` collapses search to a 🔍 icon on mobile; tapping opens a full-screen search overlay.
- `SearchBar`, `FolderTile`, `/search`, `/d/[id]`, `/f/[id]` CSS tokenized against `globals.css`.
- New component-test infra (jsdom + @testing-library/react); three new component test files covering Modal, NewFolderDialog, FolderPickerModal.

Spec: `docs/superpowers/specs/2026-04-18-ui-consistency-pass-design.md`
Plan: `docs/superpowers/plans/2026-04-18-ui-consistency-pass.md`

## Test plan
- [ ] `npm test` green (existing + 3 new component test files).
- [ ] `npm run lint` + `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Manual browser QA on desktop: upload, move, rename, create folder from main, create subfolder from folder page, search.
- [ ] Manual browser QA on mobile (375×667): TopBar search icon + overlay, modal bottom sheet, tap targets ≥44px.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned. CI runs.

- [ ] **Step 8: Wait for CI green**

```bash
gh pr checks --watch
```

Expected: all checks green. If build fails on CI but passes locally, read the CI logs — the typical culprit is a missing env var in `next build`, not a code issue.

---

## Self-review notes

**Spec coverage check:**
- Modal primitive — Task 2 ✓
- FolderPickerModal — Task 6 ✓
- FolderPicker rewrite (same API) — Task 7 ✓
- NewFolderDialog — Task 3 ✓
- NewFolderButton + placement (main + folder detail) — Tasks 4 & 5 ✓
- SearchBar tokenize + variant — Task 8 ✓
- TopBar mobile overlay — Task 9 ✓
- FolderTile polish — Task 10 ✓
- Audit `/search`, `/d/[id]`, `/f/[id]` — Tasks 11, 12, 13 ✓
- Testing (RTL infra + component tests) — Task 1 + tests in Tasks 2, 3, 6 ✓
- Manual mobile QA — Task 14 ✓

**Non-goals not in plan:** delete-confirm modal, dark mode, animations, drag-to-dismiss, `/` keyboard shortcut — correct, none implemented.

**Type consistency check:** `FolderPicker` props stay `{value, onChange}` — consumers (`UploadClient`, `FileActions`) untouched. `FolderPickerModal` body exposes `initialFolderId`, `onCancel`, `onSelect(folderId: string | null)` — consumed only by the rewritten `FolderPicker`. `NewFolderDialog` props `{open, onClose, parentId, parentName, onCreated}` — consumed only by `NewFolderButton`. No signature drift.

**Risk: the Modal focus-trap test relies on `require("react")` inline inside the test harness** — this is deliberate (to keep the mock React import inside the test body rather than hoist it; keeps jsdom env self-contained). If the test runner complains, replace with a top-level `import { useState } from "react"` and a named harness component.

**Risk: `FolderPicker` trigger fetches `/api/folders/tree` every time `value` changes** — minor; the picker modal also fetches. For a small app this is fine; if it becomes a problem, hoist to a shared context. Not in scope.

**Risk: the audit tasks (11–13) are inherently open-ended** — each is gated on "look at the module CSS, replace hardcoded hex with tokens, match main page spacing". Reviewers can verify via diff. If an audit turns up a *structural* issue (not just tokens), that becomes a separate PR, not a bolt-on here.
