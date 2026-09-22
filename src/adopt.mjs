import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies a cursor pack into packs/, unchanged.
 *
 *   node src/adopt.mjs <source folder> <pack name> [old credit] [new credit]
 *
 * The cursors and the .inf are copied byte for byte. The only thing this will
 * rewrite is the credit line in the .inf, and only when told which name to
 * replace — everything else about the pack is left exactly as its author made
 * it, including the .inf's own scheme name and install directory.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const [source, packId, oldCredit, newCredit] = process.argv.slice(2);

if (!source || !existsSync(source) || !packId) {
  console.error('usage: node src/adopt.mjs <source folder> <pack name> [old credit] [new credit]');
  process.exit(1);
}

const out = join(ROOT, 'packs', packId);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let cursors = 0;
let bytes = 0;

for (const file of readdirSync(source)) {
  const ext = extname(file).toLowerCase();
  const from = join(source, file);
  const to = join(out, file);

  if (ext === '.inf' && oldCredit && newCredit) {
    // latin1 keeps every byte intact: an .inf is not necessarily UTF-8, and a
    // lossy round-trip through it would corrupt any accented name in there.
    const text = readFileSync(from, 'latin1');
    const patched = text.split(oldCredit).join(newCredit);
    writeFileSync(to, patched, 'latin1');
    const hits = text.split(oldCredit).length - 1;
    console.log(`  ${file.padEnd(20)} credit rewritten (${hits} occurrence${hits === 1 ? '' : 's'})`);
    bytes += statSync(to).size;
    continue;
  }

  if (!['.cur', '.ani', '.inf'].includes(ext)) {
    console.log(`  ${file.padEnd(20)} skipped`);
    continue;
  }

  copyFileSync(from, to);
  if (ext !== '.inf') cursors++;
  bytes += statSync(to).size;
  console.log(`  ${file.padEnd(20)} copied`);
}

console.log(`\nDone — ${cursors} cursors, ${(bytes / 1024 / 1024).toFixed(1)} MB in packs/${packId}/`);
