// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  UploadProgressProvider,
  useUploadProgress,
} from "./UploadProgressProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

type TusCallbacks = {
  onProgress?: (uploaded: number, total: number) => void;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
};
const tusInstances: Array<TusCallbacks & {
  start: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  file: File;
}> = [];

vi.mock("tus-js-client", () => ({
  Upload: class {
    file: File;
    options: TusCallbacks;
    start = vi.fn();
    abort = vi.fn().mockResolvedValue(undefined);
    constructor(file: File, options: TusCallbacks) {
      this.file = file;
      this.options = options;
      tusInstances.push({ ...options, start: this.start, abort: this.abort, file });
    }
  },
}));

afterEach(() => {
  cleanup();
  tusInstances.length = 0;
});

function Probe() {
  const ctx = useUploadProgress();
  return (
    <div>
      <button onClick={() => ctx.enqueue(new File(["hi"], "a.mp4"), "f-1")}>enqueue</button>
      <button onClick={() => ctx.clearCompleted()}>clear</button>
      <ul data-testid="rows">
        {ctx.uploads.map((u) => (
          <li key={u.id}>
            {u.name} | {u.status} | {u.uploaded}/{u.size}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderProbe() {
  return render(
    <UploadProgressProvider>
      <Probe />
    </UploadProgressProvider>,
  );
}

describe("UploadProgressProvider", () => {
  it("enqueue adds an uploading row and starts tus", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    expect(screen.getByText(/a\.mp4 \| uploading/)).toBeInTheDocument();
    expect(tusInstances[0].start).toHaveBeenCalled();
  });

  it("progress callback updates the row", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onProgress?.(42, 100);
    });
    expect(screen.getByText(/42\/\d+/)).toBeInTheDocument();
  });

  it("onSuccess marks the row done and dispatches vorevault:upload-done", async () => {
    const evt = vi.fn();
    window.addEventListener("vorevault:upload-done", evt);
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onSuccess?.();
    });
    expect(screen.getByText(/a\.mp4 \| done/)).toBeInTheDocument();
    expect(evt).toHaveBeenCalled();
    window.removeEventListener("vorevault:upload-done", evt);
  });

  it("onError marks the row error", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onError?.(new Error("boom"));
    });
    expect(screen.getByText(/a\.mp4 \| error/)).toBeInTheDocument();
  });

  it("clearCompleted removes done and error rows but keeps in-flight", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onSuccess?.();
    });
    await act(async () => {
      screen.getByText("clear").click();
    });
    const rows = screen.getByTestId("rows").children;
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toMatch(/uploading/);
  });
});
