// Polyfill File for Node 18 (required by testcontainers -> undici)
import { File as NodeFile } from "node:buffer";
if (typeof globalThis.File === "undefined") {
  (globalThis as unknown as { File: typeof NodeFile }).File = NodeFile;
}
export {};
