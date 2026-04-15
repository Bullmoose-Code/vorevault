import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1 AS ok");
    return NextResponse.json({ status: "ok", db: "up" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
