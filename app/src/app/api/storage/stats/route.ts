import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStorageStats } from "@/lib/storage-stats";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const stats = await getStorageStats();
  return NextResponse.json(stats);
}
