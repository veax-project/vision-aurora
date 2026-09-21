import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

import { CURSORS, svgDoc } from './shapes.mjs';
import { THEMES } from './themes.mjs';
import { rasterize } from './lib/raster.mjs';
import { dataUri } from './lib/png.mjs';
import { cycleColour } from './lib/cycle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'preview');

const CELL = 104;
const COLS = 9;
const SHOT = 160;

const BG_DARK = '#14161c';
const BG_LIGHT = '#e8eaf0';
const LABEL = '#79839b';

function png(svg, width) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  }).render().asPng();
}

/** Rasterises a cursor exactly the way build.mjs does, then embeds the result. */
function shot(theme, cursor, { phase = 0, frame = 0, size = SHOT } = {}) {
  const t = theme.cycle ? { ...theme, line: cycleColour(theme.cycle, phase) } : theme;
  const svg = svgDoc(t, cursor.draw(t, frame));
  const { width, height, rgba } = rasterize(svg, size, { grid: t.grid, outline: t.line });
  return dataUri(width, height, rgba);
}

function text(x, y, s, { size = 13, fill = LABEL, anchor = 'start', weight = 400 } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Segoe UI, Arial" font-size="${size}" font-weight="${weight}" fill="${fill}">${s}</text>`;
}

/** All 17 cursors over a split dark/light background. */
function sheet(theme) {
  const items = Object.values(CURSORS);
  const rows = Math.ceil(items.length / COLS);
  const w = COLS * CELL;
  const h = rows * CELL + 58;

  const cells = items.map((cursor, i) => {
    const x = (i % COLS) * CELL + 8;
    const y = Math.floor(i / COLS) * CELL + 62;
    return `<image href="${shot(theme, cursor)}" x="${x}" y="${y}" width="88" height="88"/>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${BG_DARK}"/>
<rect x="${w / 2}" y="58" width="${w / 2}" height="${h - 58}" fill="${BG_LIGHT}"/>
<rect width="${w}" height="58" fill="#0d0f14"/>
<circle cx="27" cy="29" r="11" fill="${theme.accent}"/>
${text(50, 35, theme.name, { size: 20, fill: '#fff', weight: 600 })}
${text(w - 14, 35, theme.tagline, { anchor: 'end' })}
${cells}
</svg>`;
}

/** The outline drift, sampled across one full loop. */
function cycle(theme) {
  const steps = theme.cycleFrames || 10;
  const cellW = 118;
  const w = steps * cellW;
  const h = 196;

  const cells = Array.from({ length: steps }, (_, i) => {
    const phase = i / steps;
    return `<image href="${shot(theme, CURSORS.pointer, { phase })}" x="${i * cellW + 14}" y="16" width="92" height="92"/>
<rect x="${i * cellW + 30}" y="122" width="60" height="16" rx="3" fill="${cycleColour(theme.cycle, phase)}"/>
${text(i * cellW + cellW / 2, 158, `${(phase * (theme.cycleFrames || 10) * (theme.cycleJiffies || 48) / 60).toFixed(1)}s`, { size: 11, anchor: 'middle' })}`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${BG_DARK}"/>
${cells}
${text(w / 2, 184, 'one loop of the outline drift — 8 seconds end to end', { size: 12, anchor: 'middle' })}
</svg>`;
}

/** Three phases blown up, where the tint on the outline is actually visible. */
function closeup(theme) {
  const names = ['white', 'pastel mint', 'pastel cyan'];
  const cellW = 270;
  const w = 3 * cellW;
  const h = 300;
  const cells = names.map((label, i) => {
    const phase = i / 3;
    return `<image href="${shot(theme, CURSORS.pointer, { phase, size: 512 })}" x="${i * cellW + 25}" y="18" width="220" height="220"/>
${text(i * cellW + cellW / 2, 266, label, { size: 15, anchor: 'middle', fill: '#e7e9f0', weight: 600 })}
${text(i * cellW + cellW / 2, 286, cycleColour(theme.cycle, phase), { size: 12, anchor: 'middle' })}`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${BG_DARK}"/>
${cells}
</svg>`;
}

/** One cursor at every baked resolution, to show it holds up small. */
function scales(theme) {
  const sizes = theme.sizes || [32, 48, 64, 96, 128];
  const pad = 30;
  let x = pad;
  const cells = sizes.map((s) => {
    const cell = `<image href="${shot(theme, CURSORS.pointer, { size: s })}" x="${x}" y="${140 - s}" width="${s}" height="${s}"/>
${text(x + s / 2, 162, `${s}`, { size: 11, anchor: 'middle' })}`;
    x += s + pad;
    return cell;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="176" viewBox="0 0 ${x} 176">
<rect width="${x}" height="176" fill="${BG_DARK}"/>
${cells}
</svg>`;
}

mkdirSync(OUT, { recursive: true });

const animated = THEMES.find((t) => t.animateAll);
const still = THEMES.find((t) => !t.animateAll);

const jobs = [
  ['closeup.png', closeup(animated), 3 * 270 * 2],
  ['cycle.png', cycle(animated), (animated.cycleFrames || 10) * 118 * 2],
  ['sheet.png', sheet(animated), COLS * CELL * 2],
  ['scales.png', scales(still), 1000],
];

for (const [name, svg, width] of jobs) {
  writeFileSync(join(OUT, name), png(svg, width));
  console.log(`preview/${name}`);
}
