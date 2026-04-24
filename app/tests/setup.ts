// Polyfill File for Node 18 (required by testcontainers -> undici)
import { File as NodeFile } from "node:buffer";
if (typeof globalThis.File === "undefined") {
  (globalThis as unknown as { File: typeof NodeFile }).File = NodeFile;
}

// Minimal DataTransfer polyfill for jsdom (jsdom does not implement it)
if (typeof globalThis.DataTransfer === "undefined") {
  class DataTransferPolyfill {
    private _data: Map<string, string> = new Map();
    effectAllowed: string = "uninitialized";
    get types(): string[] {
      return Array.from(this._data.keys());
    }
    setData(format: string, data: string): void {
      this._data.set(format, data);
    }
    getData(format: string): string {
      return this._data.get(format) ?? "";
    }
    clearData(format?: string): void {
      if (format) this._data.delete(format);
      else this._data.clear();
    }
  }
  (globalThis as unknown as { DataTransfer: typeof DataTransferPolyfill }).DataTransfer =
    DataTransferPolyfill;
}

// Minimal DragEvent polyfill for jsdom (jsdom does not implement it)
if (typeof globalThis.DragEvent === "undefined") {
  class DragEventPolyfill extends Event {
    readonly dataTransfer: DataTransfer | null;
    constructor(type: string, init?: DragEventInit) {
      super(type, init);
      this.dataTransfer = (init?.dataTransfer as DataTransfer | undefined) ?? null;
    }
  }
  (globalThis as unknown as { DragEvent: typeof DragEventPolyfill }).DragEvent = DragEventPolyfill;
}

export {};
