import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buildZipStream, type ZipEntry } from "./zip";

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("buildZipStream", () => {
  it("builds a zip with multiple entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vv-zip-test-"));
    try {
      const pathA = join(dir, "a.txt");
      const pathB = join(dir, "b.bin");
      await writeFile(pathA, "hello world");
      await writeFile(pathB, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      const entries: ZipEntry[] = [
        { name: "notes.txt", path: pathA },
        { name: "binary.bin", path: pathB },
      ];

      const stream = buildZipStream(entries);
      const buf = await collect(stream);

      // Basic zip signature: local file header starts with PK\x03\x04
      expect(buf.slice(0, 4).toString("hex")).toBe("504b0304");
      // Central directory signature PK\x01\x02 appears somewhere in the output
      expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBeGreaterThan(0);
      // End of central directory signature PK\x05\x06 near the end
      expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0);
      // Names appear in the raw bytes
      expect(buf.includes(Buffer.from("notes.txt"))).toBe(true);
      expect(buf.includes(Buffer.from("binary.bin"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles empty entry list gracefully (emits an empty-ish archive)", async () => {
    const stream = buildZipStream([]);
    const buf = await collect(stream);
    // Empty zip still has the EOCD record.
    expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThanOrEqual(0);
  });

  it("dedups colliding filenames with (2), (3) suffix preserving extensions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vv-zip-dedup-"));
    try {
      const p1 = join(dir, "a.txt");
      const p2 = join(dir, "b.txt");
      const p3 = join(dir, "c.txt");
      await writeFile(p1, "1");
      await writeFile(p2, "2");
      await writeFile(p3, "3");

      const entries: ZipEntry[] = [
        { name: "report.pdf", path: p1 },
        { name: "report.pdf", path: p2 },
        { name: "report.pdf", path: p3 },
      ];

      const stream = buildZipStream(entries);
      const buf = await collect(stream);

      // First occurrence: "report.pdf"; second: "report (2).pdf"; third: "report (3).pdf".
      expect(buf.includes(Buffer.from("report.pdf"))).toBe(true);
      expect(buf.includes(Buffer.from("report (2).pdf"))).toBe(true);
      expect(buf.includes(Buffer.from("report (3).pdf"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
