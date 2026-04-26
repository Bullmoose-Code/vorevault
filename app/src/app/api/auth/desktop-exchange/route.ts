import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exchangeAuthCode } from "@/lib/auth-codes";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(20).max(128),
  code_verifier: z.string().min(43).max(128),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const result = await exchangeAuthCode(parsed.data.code, parsed.data.code_verifier);
  if (!result) {
    return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
  }
  return NextResponse.json({ session_token: result.sessionId });
}
