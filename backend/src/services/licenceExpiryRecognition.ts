import { spawn, type ChildProcess } from "node:child_process";
import { createAggregateError, createErrorWithCause } from "./errorUtils";

const activeProcesses = new Set<ChildProcess>();
let stopProcessesPromise: Promise<void> | undefined;

type RecognitionResult =
  | { status: "recognized"; date: string }
  | { status: "not_found" | "error"; date: null };

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Only labeled, unambiguous dates are accepted. In particular, dates such as
 * 03/04/2030 cannot be safely interpreted without knowing the document format.
 */
export function extractLicenceExpiry(text: string): string | null {
  const dates = new Set<string>();
  const label = /\b(?:exp(?:ir(?:y|ation|es?|ed))?(?:\s+date)?|valid\s+until|4b)\b\s*[:.\-]?\s*([0-9]{1,4}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})/gi;
  for (const match of text.matchAll(label)) {
    const parts = match[1].split(/[\/.\-]/);
    let year: number;
    let month: number;
    let day: number;
    if (parts[0].length === 4 && parts[2].length <= 2) {
      [year, month, day] = parts.map(Number);
    } else if (parts[2].length === 4) {
      const first = Number(parts[0]);
      const second = Number(parts[1]);
      year = Number(parts[2]);
      if (first > 12 && second <= 12) [day, month] = [first, second];
      else if (second > 12 && first <= 12) [month, day] = [first, second];
      else continue;
    } else continue;
    const date = validDate(year, month, day);
    if (date) dates.add(date);
  }
  return dates.size === 1 ? [...dates][0] : null;
}

function runLocal(command: string, args: string[], input: Buffer, maxBytes: number): Promise<Buffer> {
  if (stopProcessesPromise) {
    return Promise.reject(new Error("Local OCR is unavailable while the service is shutting down"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    activeProcesses.add(child);
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill("SIGKILL");
    }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        child.kill("SIGKILL");
      } else chunks.push(chunk);
    });
    child.stdin.on("error", () => { failed = true; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      activeProcesses.delete(child);
      if (failed || code !== 0) reject(new Error("Local OCR process failed or exceeded its limits"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
}

function terminateProcess(child: ChildProcess, signal: NodeJS.Signals): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      child.removeListener("close", onExit);
      child.removeListener("error", onError);
    };
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const onError = (error: Error) => {
      cleanup();
      if (child.exitCode !== null || child.signalCode !== null) resolve(true);
      else reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(child.exitCode !== null || child.signalCode !== null);
    }, 250);
    child.once("exit", onExit);
    child.once("close", onExit);
    child.once("error", onError);
    if (child.exitCode !== null || child.signalCode !== null) {
      onExit();
      return;
    }
    try {
      child.kill(signal);
    } catch (error) {
      cleanup();
      if (child.exitCode !== null || child.signalCode !== null) resolve(true);
      else reject(error);
    }
  });
}

export function stopActiveLicenceRecognitionProcesses(): Promise<void> {
  if (!stopProcessesPromise) {
    stopProcessesPromise = (async () => {
      const results = await Promise.allSettled([...activeProcesses].map(async (child) => {
        try {
          if (await terminateProcess(child, "SIGTERM")) return;
          if (await terminateProcess(child, "SIGKILL")) return;
          throw new Error("Process did not exit after SIGTERM and SIGKILL");
        } catch (error) {
          throw createErrorWithCause(`Failed to stop OCR subprocess ${child.pid ?? "unknown"}`, error);
        }
      }));
      const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (failures.length > 0) throw createAggregateError(failures, "OCR subprocess cleanup failed");
    })();
  }
  return stopProcessesPromise;
}

export async function recognizeLicenceExpiry(buffer: Buffer, mimeType: string): Promise<RecognitionResult> {
  try {
    const image = mimeType === "application/pdf"
      ? await runLocal("pdftoppm", ["-f", "1", "-l", "1", "-scale-to", "3000", "-singlefile", "-png", "-"], buffer, 30 * 1024 * 1024)
      : buffer;
    const text = await runLocal("tesseract", ["stdin", "stdout", "-l", "eng"], image, 1024 * 1024);
    const date = extractLicenceExpiry(text.toString("utf8"));
    return date ? { status: "recognized", date } : { status: "not_found", date: null };
  } catch {
    return { status: "error", date: null };
  }
}
