import { NextRequest, NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getShareLink } from "@/lib/share-links";
import { getFile } from "@/lib/files";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

function contentDisposition(name: string, inline: boolean): string {
  const mode = inline ? "inline" : "attachment";
  const encoded = encodeURIComponent(name).replace(/%20/g, " ");
  return `${mode}; filename="${encoded}"`;
}

function isSafeInline(mime: string): boolean {
  return mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params;

  const link = await getShareLink(token);
  if (!link) return new NextResponse("not found", { status: 404 });

  const file = await getFile(link.file_id);
  if (!file) return new NextResponse("not found", { status: 404 });

  const filePath = file.transcoded_path ?? file.storage_path;
  let fileSize: bigint;
  try {
    const st = await stat(filePath);
    fileSize = BigInt(st.size);
  } catch {
    return new NextResponse("file missing from disk", { status: 410 });
  }

  const rangeHeader = req.headers.get("range");
  const inline = isSafeInline(file.mime_type);
  const disposition = contentDisposition(file.original_name, inline);

  const headers: Record<string, string> = {
    "Content-Type": file.mime_type,
    "Content-Disposition": disposition,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) return new NextResponse("invalid range", { status: 416 });
    const start = BigInt(match[1]);
    const end = match[2] ? BigInt(match[2]) : fileSize - 1n;
    if (start >= fileSize || end >= fileSize || start > end) {
      return new NextResponse("range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }
    const length = end - start + 1n;
    headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`;
    headers["Content-Length"] = length.toString();
    const nodeStream = createReadStream(filePath, {
      start: Number(start),
      end: Number(end),
    });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new NextResponse(webStream, { status: 206, headers });
  }

  headers["Content-Length"] = fileSize.toString();
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new NextResponse(webStream, { status: 200, headers });
}
