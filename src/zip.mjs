import { mkdirSync, rmSync, cpSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * Zips a pack for release, exactly as it sits in packs/ — nothing added.
 *
 *   node src/zip.mjs <pack name> ["Folder Name"]
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const packId = process.argv[2];
const folder = process.argv[3]
  || (packId || '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');

if (!packId) {
  console.error('usage: node src/zip.mjs <pack name> ["Folder Name"]');
  process.exit(1);
}

const source = join(ROOT, 'packs', packId);
if (!existsSync(source)) {
  console.error(`No pack at packs/${packId}`);
  process.exit(1);
}

// Staged under the system temp: Windows PowerShell's Compress-Archive still
// trips over the 260 character path limit, and a checkout can sit deep enough
// to cross it.
const work = join(tmpdir(), 'curzip');
const staging = join(work, folder);
const staged = join(work, `${folder}.zip`);
const zipPath = join(ROOT, 'dist', `${folder}.zip`);

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(join(ROOT, 'dist'), { recursive: true });

cpSync(source, staging, { recursive: true });

rmSync(zipPath, { force: true });
execFileSync('powershell', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
  // ZipFile rather than Compress-Archive: Compress-Archive drops names
  // beginning with a dot when given a directory, and this pack's installer is
  // called .Install.inf. The trailing $true nests everything under one folder
  // so extracting does not spill 18 files into whatever directory you are in.
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; '
  + `[System.IO.Compression.ZipFile]::CreateFromDirectory('${staging}', '${staged}', `
  + '[System.IO.Compression.CompressionLevel]::Optimal, $true)',
], { stdio: 'inherit' });

cpSync(staged, zipPath);
rmSync(work, { recursive: true, force: true });

console.log(`dist/${folder}.zip  ${(statSync(zipPath).size / 1024).toFixed(0)} KB`);
