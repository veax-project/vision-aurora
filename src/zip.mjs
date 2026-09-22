import { mkdirSync, writeFileSync, rmSync, cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * Builds the download people actually want: one folder with the cursors, an
 * installer they can double-click, and a readme — zipped.
 *
 *   node src/zip.mjs <pack name>
 *
 * Cloning a repository to change your cursor is a big ask. This is the version
 * you hand to someone who just wants the cursors.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node src/zip.mjs <pack name>');
  process.exit(1);
}

const source = join(ROOT, 'packs', pack);
if (!existsSync(join(source, 'pack.json'))) {
  console.error(`No built pack at packs/${pack}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(source, 'pack.json'), 'utf8'));
const folder = manifest.name.replace(/\s+/g, '-');

// Staged under the system temp rather than next to the repository: Windows
// PowerShell's Compress-Archive still trips over the 260 character path limit,
// and a checkout can easily sit deep enough to cross it.
const work = join(tmpdir(), 'curzip');
const staging = join(work, folder);
const staged = join(work, `${folder}.zip`);
const zipPath = join(ROOT, 'dist', `${folder}.zip`);

rmSync(work, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(join(ROOT, 'dist'), { recursive: true });

// The cursors themselves, plus both installers and the scheme file.
for (const file of readdirSync(source)) {
  cpSync(join(source, file), join(staging, file));
}
// install.ps1 detects this layout by finding pack.json beside it.
cpSync(join(ROOT, 'install.ps1'), join(staging, 'install.ps1'));
cpSync(join(ROOT, 'dist', 'install.bat'), join(staging, 'install.bat'));
cpSync(join(ROOT, 'dist', 'uninstall.bat'), join(staging, 'uninstall.bat'));

const readme = `${manifest.name}
${'='.repeat(manifest.name.length)}

${manifest.tagline}


INSTALL

  Double-click install.bat

  That copies the cursors into your own user folder and switches to them
  straight away. No administrator rights, no restart.


REMOVE

  Double-click uninstall.bat

  That puts the Windows default cursors back and deletes the copied files.


IF WINDOWS BLOCKS THE FILE

  Windows marks anything downloaded from the internet. If install.bat does
  nothing, right-click it, choose Properties, tick Unblock at the bottom,
  then try again.


${manifest.animated ? `WORTH KNOWING

  Every cursor in this pack is animated.

  Some games, remote desktop sessions and older programs force a still
  cursor. There you will see the first frame and no movement. Nothing is
  broken, that is just how Windows treats animated cursors in those places.

  Windows starts each cursor's animation when that cursor appears, so two
  different cursors are not in step with each other.


` : ''}OTHER WAY IN

  If you would rather not run a .bat, right-click install.inf and choose
  Install. That one writes into C:\\Windows and asks for administrator
  rights, then you pick "${manifest.name}" under
  Settings > Bluetooth & devices > Mouse > Additional mouse settings > Pointers.
`;

writeFileSync(join(staging, 'README.txt'), readme.replace(/\n/g, '\r\n'));

rmSync(zipPath, { force: true });
execFileSync('powershell', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
  `Compress-Archive -Path '${staging}' -DestinationPath '${staged}' -CompressionLevel Optimal`,
], { stdio: 'inherit' });

cpSync(staged, zipPath);
rmSync(work, { recursive: true, force: true });

const { size } = statSync(zipPath);
console.log(`dist/${folder}.zip  ${(size / 1024 / 1024).toFixed(1)} MB`);
