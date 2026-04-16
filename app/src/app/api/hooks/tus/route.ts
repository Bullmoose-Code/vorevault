import { NextRequest, NextResponse } from "next/server";
import { rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { getSessionUser } from "@/lib/sessions";
import {
  freeBytes, ensureDir, canonicalUploadPath, canonicalThumbPath,
  UPLOADS_DIR, MAX_FILE_BYTES, MIN_FREE_BYTES,
} from "@/lib/storage";
import {
  registerUploadSession, getUploadSession, finalizeUploadSession,
} from "@/lib/upload-sessions";
import { insertFile } from "@/lib/files";
import { generateThumbnail } from "@/lib/thumbnails";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "vv_session";

type HookHeaderMap = Record<string, string[]>;
type HookEvent = {
  Upload: {
    ID?: string;
    Size?: number;
    Storage?: { Type: string; Path: string };
    MetaData?: Record<string, string>;
  };
  HTTPRequest?: { Header?: HookHeaderMap };
};
type HookBody = { Type?: string; Event: HookEvent };

function reject(status: number, body: string) {
  return NextResponse.json({
    HTTPResponse: { StatusCode: status, Body: body },
    RejectUpload: true,
  });
}

function accept() {
  return NextResponse.json({ HTTPResponse: { StatusCode: 200 } });
}

function readSessionCookie(headers: HookHeaderMap | undefined): string | null {
  const cookieHeader = headers?.Cookie?.[0] ?? headers?.cookie?.[0];
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

export async function POST(req: NextRequest) {
  const hookName = req.headers.get("hook-name");
  const body = (await req.json()) as HookBody;

  if (hookName === "pre-create") return preCreate(body);
  if (hookName === "post-finish") return postFinish(body);
  return accept(); // ignore other hook events
}

async function preCreate(body: HookBody) {
  const sid = readSessionCookie(body.Event.HTTPRequest?.Header);
  if (!sid) return reject(401, "auth required");
  const user = await getSessionUser(sid);
  if (!user) return reject(401, "invalid session");

  const size = BigInt(body.Event.Upload.Size ?? 0);
  if (size > MAX_FILE_BYTES) return reject(413, "file too large");

  const free = await freeBytes(UPLOADS_DIR);
  if (free < MIN_FREE_BYTES) return reject(507, "disk full");

  const tusId = body.Event.Upload.ID ?? randomUUID();
  await registerUploadSession(tusId, user.id);
  return accept();
}

async function postFinish(body: HookBody) {
  const tusId = body.Event.Upload.ID;
  if (!tusId) return accept();
  const session = await getUploadSession(tusId);
  if (!session) return accept(); // unknown upload — orphan, ignore

  const tmpPath = body.Event.Upload.Storage?.Path;
  const originalName = body.Event.Upload.MetaData?.filename ?? "unnamed";
  const size = body.Event.Upload.Size ?? 0;
  if (!tmpPath) return accept();

  const detected = await fileTypeFromFile(tmpPath);
  const mimeType = detected?.mime ?? "application/octet-stream";

  const fileId = randomUUID();
  const dst = canonicalUploadPath(fileId, originalName);
  await ensureDir(`${UPLOADS_DIR}/${fileId}`);
  await rename(tmpPath, dst);

  const thumbDst = canonicalThumbPath(fileId);
  let meta: Awaited<ReturnType<typeof generateThumbnail>> = null;
  try {
    meta = await generateThumbnail({ srcPath: dst, mimeType, dstPath: thumbDst });
  } catch (e) {
    console.error(`thumbnail failed for ${fileId}:`, e);
  }

  const inserted = await insertFile({
    uploaderId: session.user_id,
    originalName,
    mimeType,
    sizeBytes: size,
    storagePath: dst,
    thumbnailPath: meta ? thumbDst : null,
    durationSec: meta?.durationSec ?? null,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
  });
  await finalizeUploadSession(tusId, inserted.id);
  return accept();
}
