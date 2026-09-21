import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { build10DlcPdfDocument } from '../src/lib/generate-10dlc-pdf';

async function generate() {
  try {
    console.log('[10DLC PDF] Building Rentmaikar A2P 10DLC compliance packet...');
    const doc = build10DlcPdfDocument();
    
    // Get PDF as ArrayBuffer
    const arrayBuffer = doc.output('arraybuffer');
    const buffer = Buffer.from(arrayBuffer);

    const publicDir = resolve('public');
    const downloadsDir = resolve('public/downloads');

    if (!existsSync(publicDir)) {
      mkdirSync(publicDir, { recursive: true });
    }
    if (!existsSync(downloadsDir)) {
      mkdirSync(downloadsDir, { recursive: true });
    }

    const downloadPath = resolve('public/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf');
    const rootPath = resolve('public/rentmaikar-10dlc-a2p-compliance-packet.pdf');

    writeFileSync(downloadPath, buffer);
    writeFileSync(rootPath, buffer);

    console.log(`[10DLC PDF] Successfully generated:`);
    console.log(`  - ${downloadPath} (${buffer.length} bytes)`);
    console.log(`  - ${rootPath} (${buffer.length} bytes)`);
    console.log(`Pages generated: ${doc.getNumberOfPages()}`);
  } catch (err) {
    console.error('[10DLC PDF] Error generating PDF:', err);
    process.exit(1);
  }
}

generate();
