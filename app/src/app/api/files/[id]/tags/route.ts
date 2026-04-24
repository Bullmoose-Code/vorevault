import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { attachTagToFile, TagNameError } from "@/lib/tags";

const BodySchema = z.object({ name: z.string().min(1).max(64) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const file = await getFileWithUploader(id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const tag = await attachTagToFile(id, body.name, user.id);
    return NextResponse.json({ tag });
  } catch (err) {
    if (err instanceof TagNameError) {
      return NextResponse.json({ error: "invalid tag name", reason: err.message }, { status: 400 });
    }
    throw err;
  }
}
