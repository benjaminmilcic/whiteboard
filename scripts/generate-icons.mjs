// Erzeugt die App-Icons für die zusammengelegte Spielesammlung "Igre za Lisu".
//  - favicon.svg / favicon.ico / favicon-48 : Browser-Favicon
//  - app-icon-*  : Start-/Launcher-Icon der installierten PWA
//  - apple-touch-icon : iOS-Homescreen
//
// Motiv: 2x2 bunte Spiele-Kacheln (Stift = Malen, Puzzle, Schachfigur,
//        Würfel) auf einem Farbverlauf – steht für die ganze Sammlung.
//
// Aufruf:  npm run icons   (sharp muss installiert sein)

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

// ---- Motiv: Fuchs ("lisica" = Fuchs) -------------------------------
// Kräftiges, kindgerechtes Fuchsgesicht (orange/weiß) – steht für
// "Igre za Lisu". Hoher Kontrast auf Indigo-Hintergrund, unverwechselbar.
const fox = `
  <!-- Ohren -->
  <path d="M150 206 L112 90 L236 168 Z" fill="#f97316" />
  <path d="M362 206 L400 90 L276 168 Z" fill="#f97316" />
  <path d="M160 196 L142 122 L214 172 Z" fill="#3730a3" />
  <path d="M352 196 L370 122 L298 172 Z" fill="#3730a3" />

  <!-- Kopf -->
  <path d="M256 150
           C 196 150 160 170 148 208
           C 136 246 138 290 154 330
           C 174 382 216 418 256 418
           C 296 418 338 382 358 330
           C 374 290 376 246 364 208
           C 352 170 316 150 256 150 Z" fill="#f97316" />

  <!-- Weiße Schnauze / Wangen -->
  <path d="M186 280
           C 202 270 240 274 256 296
           C 272 274 310 270 326 280
           C 328 326 300 378 256 418
           C 212 378 184 326 186 280 Z" fill="#ffffff" />

  <!-- Augen -->
  <ellipse cx="208" cy="250" rx="15" ry="19" fill="#1f2937" />
  <ellipse cx="304" cy="250" rx="15" ry="19" fill="#1f2937" />
  <circle cx="214" cy="243" r="5" fill="#ffffff" />
  <circle cx="310" cy="243" r="5" fill="#ffffff" />

  <!-- Nase -->
  <path d="M256 350
           C 243 350 234 342 234 332
           C 234 323 244 319 256 319
           C 268 319 278 323 278 332
           C 278 342 269 350 256 350 Z" fill="#1f2937" />`;

const gamesArt = fox;

const launcherDefs = `
  <defs>
    <linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6366f1" />
      <stop offset="1" stop-color="#4338ca" />
    </linearGradient>
  </defs>`;

const launcherRounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${launcherDefs}
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#lc)" />
  ${gamesArt}
</svg>`;

// Maskable: Motiv etwas kleiner, Hintergrund randlos (Safe-Zone)
const launcherMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${launcherDefs}
  <rect x="0" y="0" width="512" height="512" fill="url(#lc)" />
  <g transform="translate(256 256) scale(0.8) translate(-256 -256)">${gamesArt}</g>
</svg>`;

async function png(svg, size, name) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(outDir, name));
  console.log('  ✓', name, `(${size}px)`);
}

// PNG-basierte .ico mit mehreren Größen erzeugen
function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const bodies = [];
  images.forEach((img, i) => {
    const e = i * 16;
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0); // width
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1); // height
    entries.writeUInt8(0, e + 2); // colors
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // color planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(img.data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
    bodies.push(img.data);
  });
  return Buffer.concat([header, entries, ...bodies]);
}

async function ico(svg, sizes, name) {
  const images = [];
  for (const size of sizes) {
    const data = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    images.push({ size, data });
  }
  writeFileSync(join(outDir, name), buildIco(images));
  console.log('  ✓', name, `(ico ${sizes.join('/')}px)`);
}

console.log('Icons werden erzeugt …');

writeFileSync(join(outDir, 'favicon.svg'), launcherRounded);
console.log('  ✓ favicon.svg');
await png(launcherRounded, 48, 'favicon-48.png');
await png(launcherRounded, 192, 'app-icon-192.png');
await png(launcherRounded, 512, 'app-icon-512.png');
await png(launcherMaskable, 512, 'app-icon-maskable-512.png');
await png(launcherMaskable, 180, 'apple-touch-icon.png');
await ico(launcherRounded, [16, 32, 48], 'favicon.ico');

console.log('Fertig.');
