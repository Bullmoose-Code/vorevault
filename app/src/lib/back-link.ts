import type { FolderRow } from "./folders";

export type BackLink = { href: string; label: string };

export function backLinkForFile(_breadcrumbs: FolderRow[]): BackLink {
  // intentionally unimplemented — tests will drive the body
  throw new Error("not implemented");
}
