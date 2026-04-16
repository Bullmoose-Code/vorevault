export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTranscodeWorker } = await import("@/lib/transcode");
    startTranscodeWorker();
  }
}
