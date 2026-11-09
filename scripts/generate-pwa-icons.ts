import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');
const distDir = path.resolve(process.cwd(), 'dist');
const logoSource = path.resolve(process.cwd(), 'src/assets/rentmaikar-logo.jpg');
const iconSizes = [
  48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, 1024,
];
const maskableSizes = [96, 144, 192, 256, 384, 512, 1024];

async function generateSquareIcon(
  emblem: Buffer,
  size: number,
  paddingPercent: number,
): Promise<Buffer> {
  const innerSize = Math.round(size * (1 - paddingPercent * 2));
  const resizedEmblem = await sharp(emblem)
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resizedEmblem, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function createIco(images: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function generateSocialImage(logo: Buffer): Promise<Buffer> {
  const canvas = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#0A1628"/>
      <rect x="442" y="46" width="316" height="316" rx="40" fill="#FFFFFF" stroke="#10B981" stroke-width="5"/>
      <text x="600" y="456" fill="#10B981" font-family="Arial, sans-serif" font-size="46" text-anchor="middle">
        Rideshare vehicle rentals
      </text>
    </svg>
  `);
  const logoImage = await sharp(logo)
    .resize(276, 254, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  return sharp(canvas)
    .composite([{ input: logoImage, left: 462, top: 77 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generate() {
  const source = await sharp(logoSource).metadata();
  if (!source.width || !source.height || source.width < 214 || source.height < 150) {
    throw new Error('Legacy RentMaikar logo has unexpected dimensions.');
  }

  const emblem = await sharp(logoSource)
    .extract({ left: 68, top: 46, width: 146, height: 104 })
    .png()
    .toBuffer();
  const generatedIcons = new Map<number, Buffer>();

  for (const size of iconSizes) {
    const icon = await generateSquareIcon(emblem, size, 0.1);
    generatedIcons.set(size, icon);
    fs.writeFileSync(path.join(publicDir, `pwa-icon-${size}.png`), icon);
  }

  for (const size of maskableSizes) {
    const icon = await generateSquareIcon(emblem, size, 0.22);
    fs.writeFileSync(path.join(publicDir, `pwa-icon-maskable-${size}.png`), icon);
  }

  const favicon = await generateSquareIcon(emblem, 64, 0.1);
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon);
  fs.writeFileSync(
    path.join(publicDir, 'apple-touch-icon.png'),
    await generateSquareIcon(emblem, 180, 0.1),
  );
  const icoImages = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await generateSquareIcon(emblem, size, 0.08),
    })),
  );
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createIco(icoImages));

  const icon512 = generatedIcons.get(512);
  if (!icon512) throw new Error('Failed to generate the master legacy icon.');
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image href="data:image/png;base64,${icon512.toString('base64')}" width="512" height="512"/></svg>`;
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg);

  const socialImage = await generateSocialImage(
    await sharp(logoSource).jpeg({ quality: 95 }).toBuffer(),
  );
  fs.writeFileSync(path.join(publicDir, 'og-image.png'), socialImage);
  await sharp(socialImage).jpeg({ quality: 92 }).toFile(path.join(publicDir, 'og-image.jpg'));

  if (fs.existsSync(distDir)) {
    for (const name of [
      ...iconSizes.map((size) => `pwa-icon-${size}.png`),
      ...maskableSizes.map((size) => `pwa-icon-maskable-${size}.png`),
      'favicon.png',
      'favicon.ico',
      'apple-touch-icon.png',
      'icon.svg',
      'og-image.png',
      'og-image.jpg',
    ]) {
      fs.copyFileSync(path.join(publicDir, name), path.join(distDir, name));
    }
  }
}

generate().catch((error) => {
  console.error('Failed to generate legacy RentMaikar icons:', error);
  process.exit(1);
});
