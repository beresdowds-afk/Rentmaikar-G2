import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');
const distDir = path.resolve(process.cwd(), 'dist');
const logoSource = path.resolve(process.cwd(), 'src/assets/rentmaikar-logo.jpg');

async function run() {
  console.log('Extracting emblem from rentmaikar-logo.jpg...');
  
  // Tight emblem crop: left: 68, top: 46, width: 146, height: 104
  const emblemBuffer = await sharp(logoSource)
    .extract({ left: 68, top: 46, width: 146, height: 104 })
    .toBuffer();

  // Helper to generate a centered square icon with white background and balanced padding
  async function generateSquareIcon(size: number, paddingPercent = 0.12): Promise<Buffer> {
    const innerSize = Math.round(size * (1 - paddingPercent * 2));
    
    // Resize emblem to fit within innerSize x innerSize, maintaining aspect ratio
    const resizedEmblem = await sharp(emblemBuffer)
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer();

    // Composite onto a clean white square of exact dimensions
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: resizedEmblem, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  // Generate 512x512 high-res master
  const icon512 = await generateSquareIcon(512, 0.10);
  
  // Generate each icon size
  const sizes = [
    { name: 'favicon.png', size: 64, padding: 0.10 },
    { name: 'apple-touch-icon.png', size: 180, padding: 0.10 },
    { name: 'pwa-icon-192.png', size: 192, padding: 0.10 },
    { name: 'pwa-icon-384.png', size: 384, padding: 0.10 },
    { name: 'pwa-icon-512.png', size: 512, padding: 0.10 },
    { name: 'pwa-icon-maskable-192.png', size: 192, padding: 0.18 },
    { name: 'pwa-icon-maskable-384.png', size: 384, padding: 0.18 },
    { name: 'pwa-icon-maskable-512.png', size: 512, padding: 0.18 },
  ];

  for (const item of sizes) {
    const buf = await generateSquareIcon(item.size, item.padding);
    fs.writeFileSync(path.join(publicDir, item.name), buf);
    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, item.name), buf);
    }
    console.log(`✓ Generated ${item.name} (${item.size}x${item.size})`);
  }

  // Generate favicon.ico (32x32 PNG format, compatible with modern browsers)
  const ico32 = await generateSquareIcon(32, 0.08);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico32);
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'favicon.ico'), ico32);
  }
  console.log('✓ Generated favicon.ico (32x32)');

  // Generate public/icon.svg with embedded high-res emblem
  const base64Png = icon512.toString('base64');
  const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="512" height="512" fill="#FFFFFF"/>
  <image href="data:image/png;base64,${base64Png}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'icon.svg'), svgContent, 'utf-8');
  }
  console.log('✓ Generated icon.svg');
}

run().catch(err => {
  console.error('Error generating favicon:', err);
  process.exit(1);
});
