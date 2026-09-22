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


