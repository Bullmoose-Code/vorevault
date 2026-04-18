import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { searchEverything } from "@/lib/search";

const QuerySchema = z.object({
  q: z.string().min(2),
  folder: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q"),
    folder: url.searchParams.get("folder") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "query_too_short" }, { status: 400 });

  const result = await searchEverything({
    query: parsed.data.q,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    scopeFolderId: parsed.data.folder,
  });
  return NextResponse.json(result);
}
