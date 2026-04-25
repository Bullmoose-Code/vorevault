# Contextual Back-to-Folder Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the file-detail page, change the "← back to vault" link so that when the file lives inside a folder, it reads "← back to *<folder name>*" and links to that folder. Files at the vault root keep the existing "← back to vault" → `/` behavior.

**Architecture:** Extract a tiny pure helper (`backLinkForFile`) in `app/src/lib/`, unit-test it, and wire it into `app/src/app/(shell)/f/[id]/page.tsx`. The file's own `folder_id` and the existing `getBreadcrumbs()` result are the source of truth — no new query params, no referrer tracking, no client-side state. Server-rendered, deterministic.

**Tech Stack:** TypeScript strict, Vitest, Next.js 15 App Router (server component).

---

## Spec mapping

This plan implements item **Theme 2.1** from `docs/superpowers/specs/2026-04-25-roadmap-design.md`:

> **Contextual back button on file detail** — "Back to *Apex Clips*" when the user came from a folder, "Back to vault" otherwise.

**Implementation simplification vs. spec:** the spec mentions `?from=folder/<id>` or referrer tracking. After reading the code, the file's own `folder_id` is sufficient and cleaner — files in folders almost always belong to that folder, and the browser back button already handles "got here from /recent/search." This avoids URL pollution and a stateful client step. If true history-aware back is wanted later, it can be a follow-up item.

**Out of scope (Theme 2.3 observation):** while exploring, I noticed `app/src/app/(shell)/f/[id]/page.tsx:63-65` already renders a `<Breadcrumbs>` row when a file has a folder — so Theme 2.3 ("folder breadcrumb on file detail header") is mostly already shipped. No changes needed there.

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `app/src/lib/back-link.ts` | **Create** | Pure helper that derives `{ href, label }` from a folder breadcrumb chain |
| `app/src/lib/back-link.test.ts` | **Create** | Vitest unit tests for the helper (no DB, no React) |
| `app/src/app/(shell)/f/[id]/page.tsx` | **Modify** (lines 6, 60-62) | Use the helper to compute the back link instead of hardcoding `/` |

No CSS changes — the existing `styles.back` rule on the `<div>` already styles whatever text is inside the anchor.

---

## Task 1: Create branch + failing tests for `backLinkForFile`

**Files:**
- Create: `app/src/lib/back-link.ts`
- Create: `app/src/lib/back-link.test.ts`

- [ ] **Step 1: Create the feature branch from latest main**

```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feat/back-to-folder-link
```

- [ ] **Step 2: Create the helper stub so the test file can import it**

Create `app/src/lib/back-link.ts`:

```ts
import type { FolderRow } from "./folders";

export type BackLink = { href: string; label: string };

export function backLinkForFile(_breadcrumbs: FolderRow[]): BackLink {
  // intentionally unimplemented — tests will drive the body
  throw new Error("not implemented");
}
```

- [ ] **Step 3: Write the failing tests**

Create `app/src/lib/back-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backLinkForFile } from "./back-link";
import type { FolderRow } from "./folders";

function folder(id: string, name: string, parent_id: string | null = null): FolderRow {
  return {
    id,
    name,
    parent_id,
    created_by: "00000000-0000-4000-8000-000000000000",
    created_at: new Date("2026-04-25T00:00:00Z"),
    deleted_at: null,
  };
}

describe("backLinkForFile", () => {
  it("returns 'back to vault' when the file has no folder (empty breadcrumbs)", () => {
    expect(backLinkForFile([])).toEqual({
      href: "/",
      label: "back to vault",
    });
  });

  it("returns 'back to <folder>' when the file is in a top-level folder", () => {
    const crumbs = [folder("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Apex Clips")];
    expect(backLinkForFile(crumbs)).toEqual({
      href: "/d/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      label: "back to Apex Clips",
    });
  });

  it("returns 'back to <innermost folder>' when the file is in a nested folder", () => {
    const crumbs = [
      folder("11111111-1111-4111-8111-111111111111", "Clips"),
      folder("22222222-2222-4222-8222-222222222222", "Apex", "11111111-1111-4111-8111-111111111111"),
    ];
    expect(backLinkForFile(crumbs)).toEqual({
      href: "/d/22222222-2222-4222-8222-222222222222",
      label: "back to Apex",
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail with "not implemented"**

```bash
cd /root/vorevault/app
npm test -- src/lib/back-link.test.ts
```

Expected: 3 failing tests, all throwing `Error: not implemented`.

- [ ] **Step 5: Commit the failing tests + stub**

```bash
cd /root/vorevault
git add app/src/lib/back-link.ts app/src/lib/back-link.test.ts
git commit -m "test(back-link): failing unit tests for backLinkForFile helper"
```

---

## Task 2: Implement `backLinkForFile`

**Files:**
- Modify: `app/src/lib/back-link.ts`

- [ ] **Step 1: Replace the stub body with the real implementation**

Replace the entire contents of `app/src/lib/back-link.ts` with:

```ts
import type { FolderRow } from "./folders";

export type BackLink = { href: string; label: string };

/**
 * Derive the file-detail page's back-link target from the file's folder
 * breadcrumb chain. Pass `[]` for files at the vault root.
 *
 * Why a helper: keeps the page server-component declarative and lets us
 * unit-test the link logic without rendering React or hitting the DB.
 */
export function backLinkForFile(breadcrumbs: FolderRow[]): BackLink {
  if (breadcrumbs.length === 0) {
    return { href: "/", label: "back to vault" };
  }
  const innermost = breadcrumbs[breadcrumbs.length - 1];
  return { href: `/d/${innermost.id}`, label: `back to ${innermost.name}` };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /root/vorevault/app
npm test -- src/lib/back-link.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Run the full test suite to confirm nothing else broke**

```bash
cd /root/vorevault/app
npm test
```

Expected: full suite green (or same skip count as before — testcontainers tests skip in this environment with no Docker; that is normal per the existing project pattern).

- [ ] **Step 4: Commit the implementation**

```bash
cd /root/vorevault
git add app/src/lib/back-link.ts
git commit -m "feat(back-link): implement backLinkForFile helper"
```

---

## Task 3: Wire the helper into the file detail page

**Files:**
- Modify: `app/src/app/(shell)/f/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `app/src/app/(shell)/f/[id]/page.tsx`, add a new import next to the other `@/lib` imports (after line 7, `import { isBookmarked } from "@/lib/bookmarks";`):

```ts
import { backLinkForFile } from "@/lib/back-link";
```

- [ ] **Step 2: Compute the back link from the breadcrumbs**

After the existing `Promise.all` (lines 43-47), add:

```ts
  const back = backLinkForFile(breadcrumbs);
```

The full block should read:

```ts
  const [breadcrumbs, bookmarked, tags] = await Promise.all([
    file.folder_id ? getBreadcrumbs(file.folder_id) : Promise.resolve([]),
    isBookmarked(user.id, file.id),
    listTagsForFile(file.id),
  ]);

  const back = backLinkForFile(breadcrumbs);
```

- [ ] **Step 3: Replace the hardcoded back link**

Change line 62 from:

```tsx
      <div className={styles.back}><a href="/">← back to vault</a></div>
```

to:

```tsx
      <div className={styles.back}><a href={back.href}>← {back.label}</a></div>
```

- [ ] **Step 4: TypeScript check + build**

```bash
cd /root/vorevault/app
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit the page change**

```bash
cd /root/vorevault
git add app/src/app/\(shell\)/f/\[id\]/page.tsx
git commit -m "feat(file-detail): contextual back link points to current folder"
```

---

## Task 4: Smoke test + push + open PR

**Files:** none modified.

- [ ] **Step 1: Run the dev server locally and smoke test**

This task can only be claimed complete after manual browser verification — there is no automated path-coverage test for the page render.

```bash
cd /root/vorevault/app
npm run dev
```

Then in a browser:
1. Open the vault.
2. Click into any folder (e.g. *Apex Clips*).
3. Click any file inside that folder.
4. Verify the back link reads `← back to Apex Clips` and clicking it lands on `/d/<that folder id>`.
5. Go to the home grid; click any file at the vault root (no folder).
6. Verify the back link reads `← back to vault` and clicking it lands on `/`.
7. Bonus: navigate into a nested folder (folder inside a folder), click a file, verify the link points to the *innermost* folder, not the parent.

If any of (4)/(6)/(7) fails, fix and re-test before continuing.

- [ ] **Step 2: Push the branch**

```bash
cd /root/vorevault
git push -u origin feat/back-to-folder-link
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(file-detail): contextual back link points to current folder" --body "$(cat <<'EOF'
## Summary
- File-detail back link now reads `← back to <folder name>` and links to that folder when the file lives in one
- Files at the vault root keep the existing `← back to vault` → `/` behavior
- Logic lives in a tiny pure helper (`app/src/lib/back-link.ts`) with unit-test coverage; the page consumes the helper and stays declarative

## Why
Before this PR, the back link on the file-detail page always pointed to `/`, which dumped users out of their current folder context and forced an extra click to drill back in. Implements Theme 2.1 from \`docs/superpowers/specs/2026-04-25-roadmap-design.md\`.

## Test plan
- [x] Vitest unit tests for `backLinkForFile` (empty / top-level / nested)
- [x] Local browser smoke test: file in folder, file at vault root, file in nested folder

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm CI passes, then merge**

Wait for the GitHub Actions `ci` job to go green. When it does, merge via the GitHub UI (squash) or:

```bash
gh pr merge --squash --delete-branch
```

Watchtower on LXC 105 will auto-pull the new image within ~4 minutes of the deploy job finishing (per `docs/superpowers/specs/2026-04-25-roadmap-design.md` reference to the existing CI/CD flow documented in `VOREVAULT_MASTER_CONTEXT.md` §13).

- [ ] **Step 5: Final verification on production**

After Watchtower deploys, visit `https://vault.bullmoosefn.com`, repeat steps 2-7 from Task 4 Step 1 against the live site. If all good, the work is done.
