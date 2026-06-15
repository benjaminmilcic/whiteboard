// Erzeugt die App-Icons für die zusammengelegte App.
//  - whiteboard-icon-*  : Mal-/Whiteboard-Motiv (für die Auswahl-Kachel + PWA)
//  - app-icon-*         : kombiniertes Start-Icon (Anker + Stift) für die
//                         installierte PWA der Gesamt-App
// Aufruf:  npm run icons   (sharp muss installiert sein)

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

// ---- Motiv: Whiteboard / Malen --------------------------------------
// Weißes Blatt mit bunten Kritzel-Strichen und einem gelben Stift.
const board = `
  <g>
    <rect x="92" y="104" width="328" height="304" rx="30" fill="#ffffff"
          stroke="#e2e8f0" stroke-width="6" />
    <g fill="none" stroke-width="20" stroke-linecap="round">
      <path d="M132 188 q40 -34 80 0 t80 0 t40 -10" stroke="#ef4444" />
      <path d="M132 256 q40 -34 80 0 t80 0 t40 -10" stroke="#22c55e" />
      <path d="M132 324 q40 -34 80 0 t80 0 t40 -10" stroke="#3b82f6" />
    </g>
  </g>
  <!-- Stift, diagonal über die rechte untere Ecke -->
  <g transform="rotate(45 360 360)">
    <rect x="338" y="150" width="44" height="250" rx="10" fill="#fbbf24"
          stroke="#f59e0b" stroke-width="4" />
    <rect x="338" y="150" width="44" height="40" fill="#f472b6" />
    <polygon points="338,400 382,400 360,452" fill="#fde68a" stroke="#f59e0b" stroke-width="4" />
    <polygon points="350,430 370,430 360,452" fill="#1f2937" />
  </g>`;

const wbDefs = `
  <defs>
    <linearGradient id="wb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa" />
      <stop offset="1" stop-color="#ec4899" />
    </linearGradient>
  </defs>`;

const wbRounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${wbDefs}
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#wb)" />
  ${board}
</svg>`;

const wbMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${wbDefs}
  <rect x="0" y="0" width="512" height="512" fill="url(#wb)" />
  <g transform="translate(256 256) scale(0.82) translate(-256 -256)">${board}</g>
</svg>`;

// ---- Kombiniertes Start-Icon (Anker + Stift) ------------------------
const launcherDefs = `
  <defs>
    <linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#38bdf8" />
      <stop offset="1" stop-color="#6366f1" />
    </linearGradient>
  </defs>`;

const launcherArt = `
  <!-- Anker (links) -->
  <g fill="none" stroke="#ffffff" stroke-width="20"
     stroke-linecap="round" stroke-linejoin="round"
     transform="translate(150 256) scale(0.62) translate(-256 -256)">
    <line x1="256" y1="152" x2="256" y2="398" />
    <circle cx="256" cy="122" r="30" />
    <line x1="198" y1="184" x2="314" y2="184" />
    <path d="M148 298 A108 108 0 0 0 364 298" />
    <path d="M148 298 L120 256" />
    <path d="M364 298 L392 256" />
  </g>
  <!-- Stift (rechts) -->
  <g transform="translate(330 256) rotate(30) scale(0.9)">
    <rect x="-22" y="-120" width="44" height="200" rx="10" fill="#fbbf24" stroke="#f59e0b" stroke-width="4" />
    <rect x="-22" y="-120" width="44" height="34" fill="#f472b6" />
    <polygon points="-22,80 22,80 0,128" fill="#fde68a" stroke="#f59e0b" stroke-width="4" />
    <polygon points="-11,108 11,108 0,128" fill="#1f2937" />
  </g>`;

const launcherRounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${launcherDefs}
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#lc)" />
  ${launcherArt}
</svg>`;

const launcherMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${launcherDefs}
  <rect x="0" y="0" width="512" height="512" fill="url(#lc)" />
  <g transform="translate(256 256) scale(0.82) translate(-256 -256)">${launcherArt}</g>
</svg>`;

async function png(svg, size, name) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(outDir, name));
  console.log('  ✓', name, `(${size}px)`);
}

console.log('Icons werden erzeugt …');

// Whiteboard
writeFileSync(join(outDir, 'whiteboard-icon.svg'), wbRounded);
await png(wbRounded, 192, 'whiteboard-icon-192.png');
await png(wbRounded, 512, 'whiteboard-icon-512.png');
await png(wbMaskable, 512, 'whiteboard-icon-maskable-512.png');

// Kombiniertes App-/Launcher-Icon
writeFileSync(join(outDir, 'favicon.svg'), launcherRounded);
await png(launcherRounded, 48, 'favicon-48.png');
await png(launcherRounded, 192, 'app-icon-192.png');
await png(launcherRounded, 512, 'app-icon-512.png');
await png(launcherMaskable, 512, 'app-icon-maskable-512.png');
await png(launcherMaskable, 180, 'apple-touch-icon.png');

console.log('Fertig.');
