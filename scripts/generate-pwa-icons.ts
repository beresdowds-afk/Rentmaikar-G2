import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');
const distDir = path.resolve(process.cwd(), 'dist');

/**
 * RentMaikar Vector Brand SVG Generator
 * Generates ultra high-resolution, pixel-crisp PWA and maskable icons.
 *
 * Design features:
 * - Brand Midnight Navy background (#0A1628 -> #101F38)
 * - Dynamic aerodynamic speed-shield chassis with Sky Blue -> Royal Blue gradient (#38BDF8 -> #2563EB)
 * - Telematics GPS / IoT connectivity nodes in Emerald Green (#34D399 -> #059669)
 * - Twin LED illumination beams
 * - Mathematical safe-zone compliance: maskable icons keep all artwork strictly
 *   inside the central 76% diameter circle (Android safe zone = 80%), guaranteeing
 *   zero clipping on circular, squircle, or teardrop launcher masks.
 */
function createBrandSvg(size: number, isMaskable: boolean): string {
  const paddingFactor = isMaskable ? 0.22 : 0.12;
  const contentSize = size * (1 - paddingFactor * 2);
  const offset = size * paddingFactor;
  const cornerRadius = isMaskable ? 0 : Math.round(size * 0.22);
  const strokeWidth = Math.max(1, Math.round(size * 0.012));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Midnight Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A1628"/>
      <stop offset="50%" stop-color="#0F1D33"/>
      <stop offset="100%" stop-color="#142642"/>
    </linearGradient>

    <!-- Speed Shield Aerodynamic Gradient -->
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="45%" stop-color="#0284C7"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>

    <!-- Emerald Telematics / IoT Connectivity Gradient -->
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6EE7B7"/>
      <stop offset="50%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>

    <!-- Ambient Metallic Rim Highlight -->
    <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#10B981" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#2563EB" stop-opacity="0.1"/>
    </linearGradient>

    <!-- Soft Glow Filter -->
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.max(1, Math.round(size * 0.015))}" stdDeviation="${Math.max(2, Math.round(size * 0.025))}" flood-color="#0284C7" flood-opacity="0.45"/>
    </filter>

    <!-- Telematics Pulse Filter -->
    <filter id="pulseGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="${Math.max(1, Math.round(size * 0.02))}" flood-color="#10B981" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background Layer -->
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bgGrad)"/>

  <!-- Subtle Ambient Rim -->
  <rect x="${strokeWidth}" y="${strokeWidth}" width="${size - strokeWidth * 2}" height="${size - strokeWidth * 2}" rx="${Math.max(0, cornerRadius - strokeWidth)}" fill="none" stroke="url(#rimGrad)" stroke-width="${strokeWidth}"/>

  <!-- Main Scaled Brand Emblem -->
  <g transform="translate(${offset}, ${offset}) scale(${contentSize / 100})">
    <!-- Telematics Radar Waves (Subtle Background Signal) -->
    <path d="M 30 18 A 24 24 0 0 1 70 18" fill="none" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.35"/>
    <path d="M 22 12 A 34 34 0 0 1 78 12" fill="none" stroke="#34D399" stroke-width="2.0" stroke-linecap="round" stroke-opacity="0.25"/>

    <!-- Speed Shield / Aerodynamic Vehicle Chassis Silhouette -->
    <path d="M 50 14 C 32 14 18 26 14 44 L 14 62 C 14 74 24 84 36 86 L 36 90 C 36 92.5 38 94 40.5 94 L 44 94 C 46.5 94 48 92.5 48 90 L 48 86 L 52 86 L 52 90 C 52 92.5 53.5 94 56 94 L 59.5 94 C 62 94 64 92.5 64 90 L 64 86 C 76 84 86 74 86 62 L 86 44 C 82 26 68 14 50 14 Z" fill="url(#shieldGrad)" filter="url(#softGlow)"/>

    <!-- Cockpit / Windshield (Midnight Tint) -->
    <path d="M 27 42 C 31 29 39 23 50 23 C 61 23 69 29 73 42 C 65 44 35 44 27 42 Z" fill="#0A1628"/>

    <!-- Dual LED Headlight Projectors -->
    <circle cx="28" cy="62" r="5.5" fill="#FFFFFF"/>
    <circle cx="28" cy="62" r="3.2" fill="#38BDF8"/>
    <circle cx="72" cy="62" r="5.5" fill="#FFFFFF"/>
    <circle cx="72" cy="62" r="3.2" fill="#38BDF8"/>

    <!-- Inner RM Aerodynamic Monogram -->
    <path d="M 35 70 L 41 54 L 47 64 L 50 58 L 53 64 L 59 54 L 65 70" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.95"/>

    <!-- Telematics Connectivity Node (Live IoT Pulse) -->
    <circle cx="50" cy="74" r="3.8" fill="url(#emeraldGrad)" filter="url(#pulseGlow)"/>
    <circle cx="50" cy="74" r="1.6" fill="#FFFFFF"/>
  </g>
</svg>
`.trim();
}

async function generate() {
  console.log('==> Generating high-resolution RentMaikar PWA icons suite...');

  // Full matrix of required and high-resolution icons for modern PWA installation
  const iconConfigs = [
    // Standard purpose: "any" icons
    { name: 'pwa-icon-48.png', size: 48, maskable: false },
    { name: 'pwa-icon-72.png', size: 72, maskable: false },
    { name: 'pwa-icon-96.png', size: 96, maskable: false },
    { name: 'pwa-icon-128.png', size: 128, maskable: false },
    { name: 'pwa-icon-144.png', size: 144, maskable: false },
    { name: 'pwa-icon-152.png', size: 152, maskable: false },
    { name: 'pwa-icon-180.png', size: 180, maskable: false },
    { name: 'apple-touch-icon.png', size: 180, maskable: false },
    { name: 'pwa-icon-192.png', size: 192, maskable: false },
    { name: 'pwa-icon-256.png', size: 256, maskable: false },
    { name: 'pwa-icon-384.png', size: 384, maskable: false },
    { name: 'pwa-icon-512.png', size: 512, maskable: false },
    { name: 'pwa-icon-1024.png', size: 1024, maskable: false },

    // Android 8+ Adaptive Maskable icons (purpose: "maskable")
    { name: 'pwa-icon-maskable-96.png', size: 96, maskable: true },
    { name: 'pwa-icon-maskable-144.png', size: 144, maskable: true },
    { name: 'pwa-icon-maskable-192.png', size: 192, maskable: true },
    { name: 'pwa-icon-maskable-256.png', size: 256, maskable: true },
    { name: 'pwa-icon-maskable-384.png', size: 384, maskable: true },
    { name: 'pwa-icon-maskable-512.png', size: 512, maskable: true },
    { name: 'pwa-icon-maskable-1024.png', size: 1024, maskable: true },

    // Favicon PNG
    { name: 'favicon.png', size: 64, maskable: false },
  ];

  for (const config of iconConfigs) {
    const svg = createBrandSvg(config.size, config.maskable);
    const destPublic = path.join(publicDir, config.name);

    await sharp(Buffer.from(svg))
      .resize(config.size, config.size)
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(destPublic);

    // Sync to dist if dist directory exists
    if (fs.existsSync(distDir)) {
      const destDist = path.join(distDir, config.name);
      fs.copyFileSync(destPublic, destDist);
    }

    console.log(`  ✓ Generated ${config.name} (${config.size}x${config.size}${config.maskable ? ' [maskable]' : ''})`);
  }

  // Master Vector SVG (Infinitely scalable for any resolution)
  const masterSvg = createBrandSvg(512, false);
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), masterSvg, 'utf-8');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'icon.svg'), masterSvg, 'utf-8');
  }
  console.log('  ✓ Generated master vector icon.svg (512x512 scalable)');

  console.log('🎉 PWA high-resolution icon suite generated successfully!');
}

generate().catch((err) => {
  console.error('❌ Failed to generate PWA icons:', err);
  process.exit(1);
});
