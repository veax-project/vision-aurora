import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURSORS, svgDoc } from './shapes.mjs';
import { THEMES } from './themes.mjs';
import { rasterize } from './lib/raster.mjs';
import { buildCur } from './lib/cur.mjs';
import { buildAni } from './lib/ani.mjs';
import { buildInf, fileName, SCHEME_ORDER } from './lib/inf.mjs';
import { frameColour } from './lib/cycle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHOR = process.env.CURSOR_AUTHOR || 'Aurora';

/** Resolutions baked into a static cursor when the theme names none. */
const SIZES = [32, 48, 64, 96, 128];

/**
 * The spinners keep their own timing: one rotation per two seconds. The colour
 * loop rides along at that speed for those two cursors rather than dragging the
 * rotation down to the eight second drift used everywhere else.
 */
const SPIN_FRAMES = 24;
const SPIN_JIFFIES = 5;
/** Animated frames ship one resolution, the convention every shipping pack follows. */
const SPIN_SIZE = 64;

/**
 * Styles that scale or squeeze the artwork move the tip of the arrow with it,
 * so the hotspot goes through the same transform — otherwise the click point
 * drifts off the point of the cursor.
 */
function hotspot(theme, fraction, axis) {
  const [sx, sy] = theme.squeeze || [theme.scale || 1, theme.scale || 1];
  const s = axis === 'x' ? sx : sy;
  return (64 + (fraction * 128 - 64) * s) / 128;
}

function renderAt(theme, cursor, size, frame = 0) {
  const svg = svgDoc(theme, cursor.draw(theme, frame));
  const { width, height, rgba } = rasterize(svg, size, {
    grid: theme.grid,
    outline: theme.line,
  });
  return {
    width, height, rgba,
    hotspotX: Math.round(hotspot(theme, cursor.hx, 'x') * size),
    hotspotY: Math.round(hotspot(theme, cursor.hy, 'y') * size),
  };
}

/** A theme with its outline set to one step of the colour loop. */
function atPhase(theme, f, n) {
  if (!theme.cycle) return theme;
  return { ...theme, line: frameColour(theme.cycle, f, n) };
}

function buildCursorFile(theme, cursor) {
  const animated = cursor.frames || theme.animateAll;
  if (!animated) {
    return buildCur((theme.sizes || SIZES).map((s) => renderAt(theme, cursor, s)));
  }

  // Spinners animate their own geometry; everything else only drifts in colour,
  // so it can afford far fewer frames spread over a much longer loop.
  const spins = Boolean(cursor.frames);
  const count = spins ? SPIN_FRAMES : theme.cycleFrames || 10;
  const jiffies = spins ? SPIN_JIFFIES : theme.cycleJiffies || 48;
  const sizes = spins ? [SPIN_SIZE] : theme.sizes || SIZES;

  const frames = [];
  for (let f = 0; f < count; f++) {
    const phased = atPhase(theme, f, count);
    // The spinner reads its rotation from the frame index, so normalise it to
    // one full turn over this frame count rather than the 12 it assumes.
    const spinFrame = (f * 12) / count;
    frames.push(buildCur(sizes.map((s) => renderAt(phased, cursor, s, spinFrame))));
  }

  return buildAni(frames, {
    jiffies,
    name: `${theme.name} ${cursor.label}`,
    artist: AUTHOR,
  });
}

function buildPack(theme) {
  const out = join(ROOT, 'packs', theme.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const roles = {};
  let bytes = 0;

  for (const [key, cursor] of Object.entries(CURSORS)) {
    const name = fileName(theme, cursor);
    const buf = buildCursorFile(theme, cursor);
    writeFileSync(join(out, name), buf);
    roles[cursor.role] = name;
    bytes += buf.length;
  }

  writeFileSync(join(out, 'install.inf'), buildInf(theme, AUTHOR));

  // The installer reads this instead of assuming file extensions, since an
  // animated pack ships .ani where a static one ships .cur.
  writeFileSync(join(out, 'pack.json'), `${JSON.stringify({
    id: theme.id,
    name: theme.name,
    tagline: theme.tagline,
    animated: Boolean(theme.animateAll),
    order: SCHEME_ORDER.map((k) => CURSORS[k].role),
    roles,
  }, null, 2)}\n`);

  return { files: Object.keys(CURSORS).length, bytes };
}

const only = process.argv[2];
const list = only ? THEMES.filter((t) => t.id === only || t.id.includes(only)) : THEMES;
if (!list.length) {
  console.error(`No theme matches "${only}". Known: ${THEMES.map((t) => t.id).join(', ')}`);
  process.exit(1);
}

console.log(`Building ${list.length} pack(s) -> packs/\n`);
for (const theme of list) {
  const t0 = Date.now();
  const { files, bytes } = buildPack(theme);
  const mb = (bytes / 1024 / 1024).toFixed(1).padStart(5);
  console.log(`  ${theme.id.padEnd(15)} ${files} cursors  ${mb} MB  ${Date.now() - t0} ms`);
}
console.log('\nDone.');
