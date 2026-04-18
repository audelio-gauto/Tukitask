/**
 * Generates PWA icons from public/logo.svg using sharp.
 * Run once: node scripts/generate-icons.mjs
 */
import { createRequire } from 'module';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const sharp   = require('sharp');

const __dir    = dirname(fileURLToPath(import.meta.url));
const root     = join(__dir, '..');
const iconsDir = join(root, 'public', 'icons');
const svgPath  = join(root, 'public', 'logo.svg');

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

const DARK_BG = { r: 0, g: 0, b: 0, alpha: 1 };

const sizes = [48, 72, 96, 128, 144, 152, 180, 192, 384, 512];

async function makeIcon(size, padding, outFile) {
  const logoSize = size - padding * 2;
  const svgBuf   = readFileSync(svgPath);

  const logoBuf = await sharp(svgBuf)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: DARK_BG },
  })
    .composite([{ input: logoBuf, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(outFile);
}

async function main() {
  console.log('🎨 Generating PWA icons…');

  for (const size of sizes) {
    const padding = Math.round(size * 0.10); // 10% padding each side
    const out = join(iconsDir, `icon-${size}x${size}.png`);
    await makeIcon(size, padding, out);
    console.log(`  ✅ icon-${size}x${size}.png`);
  }

  // Maskable: 20% safe-zone padding each side
  const maskableOut = join(iconsDir, 'icon-maskable-512x512.png');
  await makeIcon(512, Math.round(512 * 0.20), maskableOut);
  console.log('  ✅ icon-maskable-512x512.png (maskable)');

  console.log(`\n✨ Done! ${sizes.length + 1} icons saved to public/icons/`);
}

main().catch(err => { console.error(err); process.exit(1); });
