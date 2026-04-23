import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getSessionUser } from "@/lib/sessions";
import { getFile } from "@/lib/files";
import { buildZipStream, type ZipEntry } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "vv_session";
const MAX_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function GET(req: NextRequest) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse("auth required", { status: 401 });

  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return new NextResponse("no ids", { status: 400 });
  if (ids.length > MAX_IDS) return new NextResponse(`max ${MAX_IDS} ids`, { status: 413 });
  for (const id of ids) {
    if (!UUID_RE.test(id)) return new NextResponse("invalid id", { status: 400 });
  }

  const entries: ZipEntry[] = [];
  for (const id of ids) {
    const file = await getFile(id);
    if (!file) continue;
    if (file.deleted_at != null) continue;
    entries.push({
      name: file.original_name,
      // Use the stored path, never the transcoded copy — users want the original upload.
      path: file.storage_path,
    });
  }
  if (entries.length === 0) return new NextResponse("no resolvable files", { status: 404 });

  const nodeStream = buildZipStream(entries);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const filename = `vorevault-${entries.length}-files-${dateStamp()}.zip`;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
