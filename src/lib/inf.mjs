import { CURSORS } from '../shapes.mjs';

/** Registry key names, in the order Windows expects them in a scheme string. */
const SCHEME_ORDER = [
  'pointer', 'help', 'work', 'busy', 'cross', 'text', 'handwriting',
  'unavailiable', 'vert', 'horz', 'dgn1', 'dgn2', 'move', 'alternate',
  'link', 'person', 'pin',
];

/**
 * A pack that animates every cursor ships .ani throughout, so the extension
 * depends on the theme, not just on whether the shape itself moves.
 */
export function fileName(theme, cursor) {
  const base = cursor.file.replace(/\.(cur|ani)$/, '');
  return theme.animateAll || cursor.frames ? `${base}.ani` : `${base}.cur`;
}

/**
 * Right-click -> Install script for a scheme.
 * Writes the files under %WinDir%\Cursors\<pack> and registers both the named
 * scheme and the live cursor assignments under HKCU.
 *
 * @param {{name:string,tagline:string}} pack
 * @param {[string,string,string][]} entries  [key, registry role, file name], in scheme order
 * @param {string} author
 */
export function buildInfFrom(pack, entries, author) {
  const dir = `Cursors\\${pack.name}`;
  const scheme = entries.map(([k]) => `%10%\\%CUR_DIR%\\%${k}%`).join(',');

  const roleLines = entries
    .map(([k, role]) => `HKCU,"Control Panel\\Cursors",${role},0x00020000,"%10%\\%CUR_DIR%\\%${k}%"`)
    .join('\n');

  const copyLines = entries.map(([, , file]) => `"${file}"`).join('\n');
  const strings = entries.map(([k, , file]) => `${k} = "${file}"`).join('\n');

  return `; ${pack.name}
; ${pack.tagline}
; Right-click this file and choose Install, then pick "${pack.name}"
; in Settings > Bluetooth & devices > Mouse > Additional mouse settings > Pointers.

[Version]
signature="$CHICAGO$"
${pack.name} by ${author}

[DefaultInstall]
CopyFiles = Scheme.Cur
AddReg    = Scheme.Reg,Scheme.Set

[DestinationDirs]
Scheme.Cur = 10,"%CUR_DIR%"

[Scheme.Reg]
HKCU,"Control Panel\\Cursors\\Schemes","%SCHEME_NAME%",,"${scheme}"

[Scheme.Set]
HKCU,"Control Panel\\Cursors",,0x00020000,"%SCHEME_NAME%"
${roleLines}

[Scheme.Cur]
${copyLines}

[Strings]
CUR_DIR     = "${dir}"
SCHEME_NAME = "${pack.name}"
${strings}
`.replace(/\n/g, '\r\n');
}


/** Convenience wrapper for a pack built from the drawing code. */
export function buildInf(theme, author) {
  return buildInfFrom(
    theme,
    SCHEME_ORDER.map((k) => [k, CURSORS[k].role, fileName(theme, CURSORS[k])]),
    author,
  );
}
export { SCHEME_ORDER };
