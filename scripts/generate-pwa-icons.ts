import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');

// Vector SVG for RentMaikar brand
function createBrandSvg(size: number, isMaskable: boolean): string {
  // Safe zone for maskable icon is within the center 80% circle (radius = size * 0.40)
  const paddingFactor = isMaskable ? 0.22 : 0.12;
  const contentSize = size * (1 - paddingFactor * 2);
  const offset = size * paddingFactor;

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0A1628"/>
        <stop offset="100%" stop-color="#142642"/>
      </linearGradient>
      <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8"/>
        <stop offset="100%" stop-color="#2563EB"/>
      </linearGradient>
      <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#34D399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#2563EB" flood-opacity="0.35"/>
      </filter>
    </defs>

    <!-- Background -->
    <rect width="${size}" height="${size}" rx="${isMaskable ? 0 : size * 0.22}" fill="url(#bgGrad)"/>

    <!-- Emblem Group -->
    <g transform="translate(${offset}, ${offset}) scale(${contentSize / 100})">
      <!-- Modern Car / Speed Shield Silhouette -->
      <path d="M 50 12 C 32 12 18 25 14 43 L 14 62 C 14 74 24 84 36 86 L 36 90 C 36 92.2 37.8 94 40 94 L 44 94 C 46.2 94 48 92.2 48 90 L 48 86 L 52 86 L 52 90 C 52 92.2 53.8 94 56 94 L 60 94 C 62.2 94 64 92.2 64 90 L 64 86 C 76 84 86 74 86 62 L 86 43 C 82 25 68 12 50 12 Z" fill="url(#blueGrad)" filter="url(#glow)" />
      
      <!-- Windshield / Aerodynamic Cockpit -->
      <path d="M 28 42 C 32 30 40 24 50 24 C 60 24 68 30 72 42 C 65 44 35 44 28 42 Z" fill="#0A1628" />

      <!-- Headlights / Telematics Beam -->
      <circle cx="28" cy="62" r="6" fill="#FFFFFF" />
      <circle cx="28" cy="62" r="3.5" fill="#38BDF8" />
      <circle cx="72" cy="62" r="6" fill="#FFFFFF" />
      <circle cx="72" cy="62" r="3.5" fill="#38BDF8" />

      <!-- Center Logo / Monogram "RM" & Connectivity Node -->
      <path d="M 44 58 L 56 58 C 58.2 58 60 59.8 60 62 C 60 64.2 58.2 66 56 66 L 44 66 Z" fill="url(#emeraldGrad)" />
      <circle cx="50" cy="74" r="3" fill="#34D399" />
    </g>
  </svg>
  `.trim();
}

async function generate() {
  console.log('Generating PWA and maskable icons...');

  const iconConfigs = [
    { name: 'favicon.png', size: 64, maskable: false },
    { name: 'apple-touch-icon.png', size: 180, maskable: false },
    { name: 'pwa-icon-192.png', size: 192, maskable: false },
    { name: 'pwa-icon-384.png', size: 384, maskable: false },
    { name: 'pwa-icon-512.png', size: 512, maskable: false },
    { name: 'pwa-icon-maskable-192.png', size: 192, maskable: true },
    { name: 'pwa-icon-maskable-384.png', size: 384, maskable: true },
    { name: 'pwa-icon-maskable-512.png', size: 512, maskable: true },
  ];

  for (const config of iconConfigs) {
    const svg = createBrandSvg(config.size, config.maskable);
    const dest = path.join(publicDir, config.name);
    await sharp(Buffer.from(svg))
      .resize(config.size, config.size)
      .png()
      .toFile(dest);
    console.log(`✓ Generated ${config.name} (${config.size}x${config.size}${config.maskable ? ' maskable' : ''})`);
  }

  // Also write clean public/icon.svg
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), createBrandSvg(512, false), 'utf-8');
  console.log('✓ Generated icon.svg');
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
