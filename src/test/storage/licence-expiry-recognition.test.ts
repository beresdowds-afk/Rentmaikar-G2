import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { spawnSync } from "node:child_process";
import {
  extractLicenceExpiry,
  recognizeLicenceExpiry,
} from "../../../backend/src/services/licenceExpiryRecognition";

describe("licence expiry recognition", () => {
  it("extracts a labeled unambiguous date without confusing DOB or issue date", () => {
    expect(extractLicenceExpiry("DOB: 1990-01-02\nISSUED: 2020-01-01\nEXPIRY DATE: 2030-10-25"))
      .toBe("2030-10-25");
    expect(extractLicenceExpiry("Expiry: 25/10/2030")).toBe("2030-10-25");
    expect(extractLicenceExpiry("EXP. 10/25/2030")).toBe("2030-10-25");
    expect(extractLicenceExpiry("4b 2030-10-25")).toBe("2030-10-25");
  });

  it("does not guess at ambiguous, invalid, unlabeled, or conflicting dates", () => {
    expect(extractLicenceExpiry("Expiry: 05/06/2030")).toBeNull();
    expect(extractLicenceExpiry("Expiry: 2029-02-29")).toBeNull();
    expect(extractLicenceExpiry("2030-10-25")).toBeNull();
    expect(extractLicenceExpiry("Expiry: 2030-10-25\nValid until: 2031-12-20")).toBeNull();
  });

  it("returns an error without inventing a date on unreadable input", async () => {
    expect(await recognizeLicenceExpiry(Buffer.from("invalid image"), "image/png"))
      .toEqual({ status: "error", date: null });
  });

  const toolsAvailable = ["pdftoppm", "tesseract"].every(
    (command) => !spawnSync(command, ["--version"]).error,
  );
  it.skipIf(!toolsAvailable)("extracts an expiry date from a rendered PDF using local OCR", async () => {
    const pdf = new jsPDF();
    pdf.setFontSize(28);
    pdf.text("DRIVERS LICENCE", 20, 30);
    pdf.text("EXPIRY DATE: 2030-10-25", 20, 60);
    const result = await recognizeLicenceExpiry(Buffer.from(pdf.output("arraybuffer")), "application/pdf");
    expect(result).toEqual({ status: "recognized", date: "2030-10-25" });
  });
});
