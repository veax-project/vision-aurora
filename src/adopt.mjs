import { mkdirSync, writeFileSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInfFrom } from './lib/inf.mjs';

/**
 * Packages an existing folder of cursors as a pack, byte for byte.
 *
 *   node src/adopt.mjs <source folder> <pack name> ["Display Name"]
 *
 * Unlike remix.mjs this changes nothing about the artwork. It only adds what is
 * needed to install it: a manifest for install.ps1 and a fresh install.inf for
 * the right-click route.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHOR = process.env.CURSOR_AUTHOR || 'veax';

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

const source = process.argv[2];
const packId = process.argv[3];
const displayName = process.argv[4]
  || (packId || '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

if (!source || !existsSync(source) || !packId) {
  console.error('usage: node src/adopt.mjs <source folder> <pack name> ["Display Name"]');
  process.exit(1);
}

const out = join(ROOT, 'packs', packId);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const roles = {};
let bytes = 0;

for (const file of readdirSync(source)) {
  const ext = extname(file).toLowerCase();
  if (!['.cur', '.ani'].includes(ext)) continue;
  const key = basename(file, extname(file));
  if (!ROLES[key]) {
    console.log(`  skipping ${file} — not a cursor role this pack knows`);
    continue;
  }
  copyFileSync(join(source, file), join(out, file));
  roles[ROLES[key]] = file;
  bytes += (await import('node:fs')).statSync(join(out, file)).size;
  console.log(`  ${file}`);
}

const present = ORDER.filter((k) => roles[ROLES[k]]);
const missing = ORDER.filter((k) => !roles[ROLES[k]]);
if (missing.length) console.log(`\n  note: no source file for ${missing.join(', ')}`);

const pack = {
  id: packId,
  name: displayName,
  tagline: 'Rounded, minimal, dark. Seventeen cursors and two animated ones.',
  animated: false,
};

writeFileSync(join(out, 'pack.json'), `${JSON.stringify({
  ...pack,
  order: present.map((k) => ROLES[k]),
  roles,
}, null, 2)}\n`);

if (!missing.length) {
  writeFileSync(
    join(out, 'install.inf'),
    buildInfFrom(pack, present.map((k) => [k, ROLES[k], roles[ROLES[k]]]), AUTHOR),
  );
} else {
  console.log('  skipping install.inf — the scheme is incomplete');
}

console.log(`\nDone — ${present.length} cursors, ${(bytes / 1024 / 1024).toFixed(1)} MB in packs/${packId}/`);
