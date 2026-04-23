import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { rows } = await pool.query<{ id: string; name: string; parent_id: string | null }>(
    `SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL ORDER BY LOWER(name)`,
  );
  return NextResponse.json({ folders: rows });
}
