import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCur, readAni } from './lib/read.mjs';
import { encodePng } from './lib/png.mjs';

/**
 * Renders preview sheets from a pack that is already built, rather than from
 * the drawing code — this proves the shipped files are what the preview shows.
 *
 *   node src/sheet.mjs <pack name> [frame]
 *
 * Cursors are cropped to their own content before being laid out. A cursor sits
 * in one corner of its canvas with most of the square empty, so dropping them in
 * uncropped leaves each one small and soft once the sheet is scaled to fit a
 * README column.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ORDER = [
  'pointer', 'help', 'work', 'busy', 'cross', 'text', 'handwriting',
  'unavailiable', 'vert', 'horz', 'dgn1', 'dgn2', 'move', 'alternate',
  'link', 'person', 'pin',
];

const DARK = [20, 22, 28];
const LIGHT = [233, 235, 241];

/**
 * A GitHub README column is about 890px wide, and an image wider than that gets
 * downscaled by the browser — which is what makes cursors look soft. Six 128px
 * cursors plus gaps fit inside it, so the sheet is displayed pixel for pixel and
 * the artwork is never resampled at all.
 */
const BOX = 128;
const GAP = 16;
const COLS = 6;

function load(dir, key, frame) {
  for (const ext of ['.ani', '.cur']) {
    const file = join(dir, key + ext);
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    const images = ext === '.ani'
      ? readCur(readAni(buf).frames[frame % readAni(buf).frames.length])
      : readCur(buf);
    return images.reduce((a, b) => (b.width > a.width ? b : a));
  }
  return null;
}

/** Trims fully transparent margins so the artwork fills its cell. */
function crop(img) {
  const { width, height, rgba } = img;
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return img;

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    rgba.copy(out, y * w * 4, ((y + y0) * width + x0) * 4, ((y + y0) * width + x1 + 1) * 4);
  }
  return { width: w, height: h, rgba: out };
}

/** Box filter: averages the source pixels each output pixel covers. */
function sample(img, fx, fy, step) {
  let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
  const x1 = Math.min(img.width, Math.max(Math.floor(fx) + 1, Math.ceil(fx + step)));
  const y1 = Math.min(img.height, Math.max(Math.floor(fy) + 1, Math.ceil(fy + step)));
  for (let y = Math.floor(fy); y < y1; y++) {
    for (let x = Math.floor(fx); x < x1; x++) {
      const s = (y * img.width + x) * 4;
      const al = img.rgba[s + 3];
      // Weight colour by alpha so transparent pixels cannot wash out the edges.
      r += img.rgba[s] * al; g += img.rgba[s + 1] * al; b += img.rgba[s + 2] * al;
      a += al; n++;
    }
  }
  if (!n || !a) return [0, 0, 0, 0];
  return [r / a, g / a, b / a, a / n];
}

function compose(items, cols) {
  const rows = Math.ceil(items.length / cols);
  const W = cols * (BOX + GAP) + GAP;
  const H = rows * (BOX + GAP) + GAP;
  const c = Buffer.alloc(W * H * 4);

  const split = Math.floor(W / 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bg = x < split ? DARK : LIGHT;
      const d = (y * W + x) * 4;
      c[d] = bg[0]; c[d + 1] = bg[1]; c[d + 2] = bg[2]; c[d + 3] = 255;
    }
  }

  items.forEach((raw, i) => {
    if (!raw) return;
    const img = crop(raw);
    // Never enlarge: a 128px cursor has no more detail to show, and blowing it
    // up is exactly what made the old sheets look soft. Only shrink if it has
    // to, which the crop makes rare.
    const k = Math.min(1, BOX / img.width, BOX / img.height);
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    const dx = GAP + (i % cols) * (BOX + GAP) + Math.round((BOX - w) / 2);
    const dy = GAP + Math.floor(i / cols) * (BOX + GAP) + Math.round((BOX - h) / 2);
    const step = 1 / k;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b, a] = sample(img, x * step, y * step, step);
        if (a === 0) continue;
        const d = ((dy + y) * W + dx + x) * 4;
        const al = a / 255;
        c[d] = Math.round(r * al + c[d] * (1 - al));
        c[d + 1] = Math.round(g * al + c[d + 1] * (1 - al));
        c[d + 2] = Math.round(b * al + c[d + 2] * (1 - al));
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

const items = ORDER.map((k) => load(dir, k, frame));
const sheet = compose(items, COLS);
writeFileSync(join(ROOT, 'preview', `${pack}.png`), encodePng(sheet.W, sheet.H, sheet.c));
console.log(`preview/${pack}.png  ${sheet.W}x${sheet.H}`);

const pointer = join(dir, 'pointer.ani');
if (existsSync(pointer)) {
  const total = readAni(readFileSync(pointer)).frames.length;
  // Every other frame, so the strip stays inside the README column at 1:1.
  const step = Math.ceil(total / 5);
  const picks = [];
  for (let f = 0; f < total; f += step) picks.push(load(dir, 'pointer', f));
  const out = compose(picks, picks.length);
  writeFileSync(join(ROOT, 'preview', `${pack}-loop.png`), encodePng(out.W, out.H, out.c));
  console.log(`preview/${pack}-loop.png  ${out.W}x${out.H}  (${picks.length} of ${total} frames)`);
}
