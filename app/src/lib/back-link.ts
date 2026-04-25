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
