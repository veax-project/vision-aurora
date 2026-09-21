import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCur, readAni } from './lib/read.mjs';
import { encodePng } from './lib/png.mjs';

/**
 * Renders a preview sheet from a pack that is already built, rather than from
 * the drawing code. A remixed pack has no SVG behind it, and even for a drawn
 * one this proves the shipped files are what the preview shows.
 *
 *   node src/sheet.mjs <pack name> [frame]
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ORDER = [
  'pointer', 'help', 'work', 'busy', 'cross', 'text', 'handwriting',
  'unavailiable', 'vert', 'horz', 'dgn1', 'dgn2', 'move', 'alternate',
  'link', 'person', 'pin',
];

const DARK = [20, 22, 28];
const LIGHT = [232, 234, 240];
const CELL = 128;
const PAD = 14;
const COLS = 9;

/** Pulls one image out of a .cur or one frame of a .ani. */
function load(dir, key, frame, size) {
  for (const ext of ['.ani', '.cur']) {
    const file = join(dir, key + ext);
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    const images = ext === '.ani'
      ? readCur(readAni(buf).frames[frame % readAni(buf).frames.length])
      : readCur(buf);
    return images.find((i) => i.width === size)
      || images.reduce((a, b) => (b.width > a.width ? b : a));
  }
  return null;
}

function compose(items, cols) {
  const rows = Math.ceil(items.length / cols);
  const W = cols * (CELL + PAD) + PAD;
  const H = rows * (CELL + PAD) + PAD;
  const c = Buffer.alloc(W * H * 4);

  const split = Math.floor(W / 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bg = x < split ? DARK : LIGHT;
      const d = (y * W + x) * 4;
      c[d] = bg[0]; c[d + 1] = bg[1]; c[d + 2] = bg[2]; c[d + 3] = 255;
    }
  }

  items.forEach((img, i) => {
    if (!img) return;
    const dx = PAD + (i % cols) * (CELL + PAD);
    const dy = PAD + Math.floor(i / cols) * (CELL + PAD);
    const scale = CELL / img.width;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const s = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
        const d = ((dy + y) * W + dx + x) * 4;
        const a = img.rgba[s + 3] / 255;
        c[d] = Math.round(img.rgba[s] * a + c[d] * (1 - a));
        c[d + 1] = Math.round(img.rgba[s + 1] * a + c[d + 1] * (1 - a));
        c[d + 2] = Math.round(img.rgba[s + 2] * a + c[d + 2] * (1 - a));
      }
    }
  });

  return { W, H, c };
}

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node src/sheet.mjs <pack name> [frame]');
  process.exit(1);
}
const frame = Number(process.argv[3] || 0);
const dir = join(ROOT, 'packs', pack);
if (!existsSync(dir)) {
  console.error(`No pack at packs/${pack}`);
  process.exit(1);
}

mkdirSync(join(ROOT, 'preview'), { recursive: true });

const items = ORDER.map((k) => load(dir, k, frame, 128));
const missing = ORDER.filter((k, i) => !items[i]);
const { W, H, c } = compose(items, COLS);
writeFileSync(join(ROOT, 'preview', `${pack}.png`), encodePng(W, H, c));
console.log(`preview/${pack}.png  (frame ${frame})${missing.length ? `  missing: ${missing}` : ''}`);

// A strip of the pointer across the whole colour loop.
const first = join(dir, 'pointer.ani');
if (existsSync(first)) {
  const total = readAni(readFileSync(first)).frames.length;
  const strip = Array.from({ length: total }, (_, f) => load(dir, 'pointer', f, 128));
  const out = compose(strip, total);
  writeFileSync(join(ROOT, 'preview', `${pack}-loop.png`), encodePng(out.W, out.H, out.c));
  console.log(`preview/${pack}-loop.png  (${total} frames)`);
}
