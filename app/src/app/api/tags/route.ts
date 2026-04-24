import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAllTagsWithCounts } from "@/lib/tags";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const tags = await listAllTagsWithCounts();
  return NextResponse.json({ tags });
}
