import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { getBreadcrumbs } from "@/lib/folders";
import { isBookmarked } from "@/lib/bookmarks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const file = await getFileWithUploader(id);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [folderBreadcrumbs, bookmarked] = await Promise.all([
    file.folder_id ? getBreadcrumbs(file.folder_id) : Promise.resolve([]),
    isBookmarked(user.id, file.id),
  ]);

  return NextResponse.json({
    ...file,
    folderId: file.folder_id,
    folderBreadcrumbs,
    bookmarked,
  });
}
