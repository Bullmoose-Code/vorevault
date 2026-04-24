import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createUploadBatch } from "@/lib/upload-batches";

export async function POST(_req?: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const batch = await createUploadBatch(user.id);
  return NextResponse.json({ batchId: batch.id });
}
