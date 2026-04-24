import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { detachTagFromFileById } from "@/lib/tags";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id, tagId } = await params;
  const file = await getFileWithUploader(id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  await detachTagFromFileById(id, tagId);
  return NextResponse.json({ ok: true });
}
