import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCur, readAni } from './lib/read.mjs';
import { retouch } from './lib/retouch.mjs';
import { buildCur } from './lib/cur.mjs';
import { buildAni } from './lib/ani.mjs';
import { frameColour } from './lib/cycle.mjs';
import { buildInfFrom } from './lib/inf.mjs';
import { OUTLINE_CYCLE } from './themes.mjs';

/**
 * Remixes an existing cursor pack in place of redrawing it.
 *
 *   node src/remix.mjs <source folder> [output name]
 *
 * Reads every .cur/.ani in the folder, thins the outline by one pixel and
 * animates it through the colour loop, then writes a new pack. The shapes are
 * never touched — this is the original artwork with a retouched edge.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const THIN = Number(process.env.REMIX_THIN ?? 1);
const AUTHOR = process.env.CURSOR_AUTHOR || 'Darques';

/** 10 frames x 48 jiffies = an 8 second drift, same as the drawn pack. */
const CYCLE_FRAMES = 10;
const CYCLE_JIFFIES = 48;

/** Registry role for each known file name, so the manifest can be written. */
const ROLES = {
  pointer: 'Arrow', help: 'Help', work: 'AppStarting', busy: 'Wait',
  cross: 'Crosshair', text: 'IBeam', handwriting: 'NWPen', unavailiable: 'No',
  vert: 'SizeNS', horz: 'SizeWE', dgn1: 'SizeNWSE', dgn2: 'SizeNESW',
  move: 'SizeAll', alternate: 'UpArrow', link: 'Hand', person: 'Person', pin: 'Pin',
};

const ORDER = [
  'pointer', 'help', 'work', 'busy', 'cross', 'text', 'handwriting',
  'unavailiable', 'vert', 'horz', 'dgn1', 'dgn2', 'move', 'alternate',
  'link', 'person', 'pin',
];

/** A still cursor becomes an animated one whose outline drifts. */
function remixCur(buf, label) {
  const images = readCur(buf);
  const frames = [];
  for (let f = 0; f < CYCLE_FRAMES; f++) {
    const colour = frameColour(OUTLINE_CYCLE, f, CYCLE_FRAMES);
    frames.push(buildCur(images.map((img) => retouch(img, { thin: THIN, colour }))));
  }
  return { buffer: buildAni(frames, { jiffies: CYCLE_JIFFIES, name: label }), frames: CYCLE_FRAMES };
}

/**
 * An already-animated cursor keeps its own frames and timing — the shape is
 * already moving, so the colour just rides one loop across those frames.
 */
function remixAni(buf, label) {
  const { frames, jiffies } = readAni(buf);
  const out = frames.map((frame, f) => {
    const colour = frameColour(OUTLINE_CYCLE, f, frames.length);
    return buildCur(readCur(frame).map((img) => retouch(img, { thin: THIN, colour })));
  });
  return { buffer: buildAni(out, { jiffies, name: label }), frames: out.length };
}

const source = process.argv[2];
const outName = process.argv[3] || 'aurora-remix';

if (!source || !existsSync(source)) {
  console.error('usage: node src/remix.mjs <folder containing .cur/.ani> [output name]');
  process.exit(1);
}

const out = join(ROOT, 'packs', outName);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = readdirSync(source).filter((f) => ['.cur', '.ani'].includes(extname(f).toLowerCase()));
if (!files.length) {
  console.error(`No .cur or .ani files in ${source}`);
  process.exit(1);
}

console.log(`Remixing ${files.length} cursors from ${source}`);
console.log(`  thinning the outline by ${THIN}px, drifting through ${OUTLINE_CYCLE.join(' -> ')}\n`);

const roles = {};
let bytes = 0;

for (const file of files) {
  const key = basename(file, extname(file));
  const buf = readFileSync(join(source, file));
  const animated = extname(file).toLowerCase() === '.ani';
  const { buffer, frames } = animated
    ? remixAni(buf, key)
    : remixCur(buf, key);

  const name = `${key}.ani`;
  writeFileSync(join(out, name), buffer);
  if (ROLES[key]) roles[ROLES[key]] = name;
  bytes += buffer.length;

  console.log(`  ${file.padEnd(20)} -> ${name.padEnd(20)} ${String(frames).padStart(2)} frames  ${(buffer.length / 1024).toFixed(0).padStart(5)} KB`);
}

const missing = ORDER.filter((k) => !roles[ROLES[k]]);
if (missing.length) {
  console.log(`\n  note: no source file for ${missing.join(', ')}`);
}

const pack = {
  id: outName,
  name: outName.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
  tagline: 'Remixed from the original artwork: thinner outline, drifting colour.',
  animated: true,
};
const present = ORDER.filter((k) => roles[ROLES[k]]);

writeFileSync(join(out, 'pack.json'), `${JSON.stringify({
  ...pack,
  order: present.map((k) => ROLES[k]),
  roles,
}, null, 2)}\n`);

// Only write the right-click installer when the scheme is complete: a partial
// .inf would register a scheme with missing cursors, which Windows fills with
// its own defaults and looks broken.
if (present.length === ORDER.length) {
  writeFileSync(
    join(out, 'install.inf'),
    buildInfFrom(pack, present.map((k) => [k, ROLES[k], roles[ROLES[k]]]), AUTHOR),
  );
} else {
  console.log('  skipping install.inf — the scheme is incomplete');
}

console.log(`\nDone — ${(bytes / 1024 / 1024).toFixed(1)} MB in packs/${outName}/`);
