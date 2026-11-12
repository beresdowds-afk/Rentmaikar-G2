import assert from "node:assert/strict";
import { mkdtemp, writeFile, access, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { recognizeLicenceExpiry, stopActiveLicenceRecognitionProcesses } from "../licenceExpiryRecognition";

it("ignores an already-closed OCR process and stops an active one once", { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rentmaikar-ocr-test-"));
  const executable = path.join(directory, "tesseract");
  const ready = path.join(directory, "ready");
  const oldPath = process.env.PATH;
  const oldReady = process.env.OCR_TEST_READY;
  const oldExit = process.env.OCR_TEST_EXIT;
  await writeFile(executable, [
    "#!/usr/bin/env node",
    "if (process.env.OCR_TEST_EXIT) { console.log('expiry date: 2030-12-31'); process.exit(0); }",
    "require('node:fs').writeFileSync(process.env.OCR_TEST_READY, 'ready');",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });
  process.env.PATH = `${directory}${path.delimiter}${oldPath ?? ""}`;
  process.env.OCR_TEST_READY = ready;

  try {
    process.env.OCR_TEST_EXIT = "1";
    assert.deepEqual(await recognizeLicenceExpiry(Buffer.from("fixture"), "image/png"), {
      status: "recognized", date: "2030-12-31",
    });
    delete process.env.OCR_TEST_EXIT;
    const recognition = recognizeLicenceExpiry(Buffer.from("fixture"), "image/png");
    let started = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await access(ready);
        started = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    assert.equal(started, true, "OCR fixture did not start");
    const first = stopActiveLicenceRecognitionProcesses();
    const second = stopActiveLicenceRecognitionProcesses();
    assert.equal(first, second);
    await first;
    assert.deepEqual(await recognition, { status: "error", date: null });
    await unlink(ready);
    assert.deepEqual(await recognizeLicenceExpiry(Buffer.from("fixture"), "image/png"), { status: "error", date: null });
    await assert.rejects(access(ready), { code: "ENOENT" });
  } finally {
    await stopActiveLicenceRecognitionProcesses();
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldReady === undefined) delete process.env.OCR_TEST_READY;
    else process.env.OCR_TEST_READY = oldReady;
    if (oldExit === undefined) delete process.env.OCR_TEST_EXIT;
    else process.env.OCR_TEST_EXIT = oldExit;
    await unlink(executable);
    try { await unlink(ready); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rmdir(directory);
  }
});
