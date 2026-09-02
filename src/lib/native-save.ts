// Cross-platform "save file" helper.
// - Web: uses file-saver (Blob → browser download).
// - iOS / Android (Capacitor): writes into Documents, then opens the native
//   Share sheet so the user can save to Files/Drive/etc.
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { saveAs } from "file-saver";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result ?? "");
      // Strip "data:...;base64," prefix
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

export async function saveZipBlob(blob: Blob, filename: string): Promise<{ path?: string; platform: string }> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.UTF8 as any, // ignored when data is base64, but required by type
      recursive: true,
    });
    try {
      await Share.share({
        title: "Document export",
        text: filename,
        url: written.uri,
      });
    } catch {
      // User cancelled share — file is still on disk.
    }
    return { path: written.uri, platform: Capacitor.getPlatform() };
  }
  saveAs(blob, filename);
  return { platform: "web" };
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
