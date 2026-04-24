"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PAGINATE_FOCUS_KEY } from "./SelectionChrome";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * Wraps a Next.js <Link> with a sessionStorage flag so <SelectionChrome>
 * can restore keyboard focus to the first grid item after the new page
 * renders. Keyboard-nav users can paginate without re-Tabbing back into
 * the grid.
 */
export function PaginationLink({ href, children, className, ...rest }: Props) {
  function onClick() {
    try {
      sessionStorage.setItem(PAGINATE_FOCUS_KEY, "1");
    } catch {
      /* storage blocked — focus won't restore but the nav still works */
    }
  }
  return (
    <Link href={href} className={className} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
