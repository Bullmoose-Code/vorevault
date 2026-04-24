import { NextRequest, NextResponse } from "next/server";
import { rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { getSessionUser } from "@/lib/sessions";
import {
  freeBytes, ensureDir, canonicalUploadPath, canonicalThumbPath,
  UPLOADS_DIR, MAX_FILE_BYTES, MIN_FREE_BYTES,
} from "@/lib/storage";
import {
  registerUploadSession, getUploadSession, finalizeUploadSession,
} from "@/lib/upload-sessions";
import { insertFile, updateTranscodeStatus } from "@/lib/files";
import { folderExists, getOrCreateUserHomeFolder } from "@/lib/folders";
import { getUserById } from "@/lib/users";
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
  // tusd v2: hook MUST return HTTP 200; rejection is signalled via body fields.
  return NextResponse.json({
    HTTPResponse: { StatusCode: status, Body: body, Header: { "Content-Type": "text/plain" } },
    RejectUpload: true,
  });
}

function accept(extra?: Record<string, unknown>) {
  return NextResponse.json({ HTTPResponse: { StatusCode: 200 }, ...extra });
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

function detectMime(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("file", ["--brief", "--mime-type", filePath], (err, stdout) => {
      if (err) resolve("application/octet-stream");
      else resolve(stdout.trim() || "application/octet-stream");
    });
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HookBody;
  // tusd v2 puts the hook type in the body's `Type` field. The `Hook-Name`
  // header from older docs/v1 is not sent. Header is checked as a fallback
  // for compatibility with the unit tests, which use the header form.
  const hookName = body.Type ?? req.headers.get("hook-name");

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

  // tusd calls pre-create BEFORE assigning an upload ID, so Upload.ID is often
  // empty. We generate our own and tell tusd to use it via ChangeFileInfo.
  const tusId = body.Event.Upload.ID || randomUUID();
  await registerUploadSession(tusId, user.id);
  return accept({ ChangeFileInfo: { ID: tusId } });
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

  const mimeType = await detectMime(tmpPath);

  const rawFolderId = body.Event.Upload.MetaData?.folderId;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let folderId: string | null = null;
  if (typeof rawFolderId === "string" && uuidRegex.test(rawFolderId)) {
    if (await folderExists(rawFolderId)) folderId = rawFolderId;
  }

  const rawBatchId = body.Event.Upload.MetaData?.upload_batch_id;
  let uploadBatchId: string | null = null;
  if (typeof rawBatchId === "string" && uuidRegex.test(rawBatchId)) {
    uploadBatchId = rawBatchId;
  }
  // No explicit folder (or explicit folder was invalid): drop the file into the
  // user's home folder, creating it on first upload so their username acts as
  // a personal root. Leading-dot usernames (e.g. ".ryan") are stored verbatim
  // — there is no hidden-folder concept in this app.
  if (folderId === null) {
    const owner = await getUserById(session.user_id);
    if (owner) folderId = await getOrCreateUserHomeFolder(owner.id, owner.username);
  }

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
    folderId,
    originalName,
    mimeType,
    sizeBytes: size,
    storagePath: dst,
    thumbnailPath: meta ? thumbDst : null,
    durationSec: meta?.durationSec ?? null,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    uploadBatchId,
  });
  await finalizeUploadSession(tusId, inserted.id);
  if (!mimeType.startsWith("video/")) {
    await updateTranscodeStatus(inserted.id, "skipped", dst);
  }
  return accept();
}
