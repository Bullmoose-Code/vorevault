import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getSessionUser } from "@/lib/sessions";
import { collectFolderTreeFiles, FolderNotFoundError, getFolder } from "@/lib/folders";
import { buildZipStream } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "vv_session";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sanitizeForFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "folder";
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse("auth required", { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse("invalid id", { status: 400 });

  const folder = await getFolder(id);
  if (!folder) return new NextResponse("folder not found", { status: 404 });

  let entries;
  try {
    entries = await collectFolderTreeFiles(id);
  } catch (e) {
    if (e instanceof FolderNotFoundError) return new NextResponse("folder not found", { status: 404 });
    throw e;
  }
  if (entries.length === 0) return new NextResponse("folder is empty", { status: 404 });

  const nodeStream = buildZipStream(entries);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const filename = `vorevault-${sanitizeForFilename(folder.name)}-${dateStamp()}.zip`;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
