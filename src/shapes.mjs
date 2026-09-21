/**
 * Cursor geometry.
 *
 * Everything is drawn on a 128x128 canvas and rasterised down, so a single
 * source of truth serves 32/48/64/96/128 px without redrawing anything.
 * Shapes stay inside a 4px margin so the drop shadow never clips.
 *
 * Hotspots are stored normalised (0..1) and multiplied by the target size,
 * which is why the same pack lines up at every cursor scale.
 */

const ARROW = 'M8 8 L8 94 L30 72 L46 108 L63 100 L47 64 L72 64 Z';

/**
 * Spinner geometry: a ring of radius 38 centred on the canvas.
 * ARC_TAIL is the full 270deg sweep, ARC_HEAD the leading 80deg that gets the
 * accent colour — the bright head is what makes it read as "spinning" rather
 * than as a static ring.
 */
const ARC_TAIL = 'M64 26 A38 38 0 1 1 26 64';
const ARC_HEAD = 'M64 26 A38 38 0 0 1 101.4 57.4';

function shadowFilter(t) {
  if (!t.shadow) return '';
  return `<filter id="sh" x="-30%" y="-30%" width="180%" height="180%">
    <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000" flood-opacity="${t.shadow}"/>
  </filter>`;
}

function glowFilter(t) {
  if (!t.glow) return '';
  return `<filter id="gl" x="-60%" y="-60%" width="220%" height="220%">
    <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="${t.glow}" flood-opacity="0.85"/>
  </filter>`;
}

/** Wraps drawing commands in a full SVG document. */
export function svgDoc(theme, inner) {
  let body = inner;

  // Blade squeezes the whole shape; soft shrinks it to make room for the swell.
  const [sx, sy] = theme.squeeze || [theme.scale || 1, theme.scale || 1];
  if (sx !== 1 || sy !== 1) {
    body = `<g transform="translate(64 64) scale(${sx} ${sy}) translate(-64 -64)">${body}</g>`;
  }

  // resvg applies one filter per element, so chain them by nesting groups.
  if (theme.shadow) body = `<g filter="url(#sh)">${body}</g>`;
  if (theme.glow) body = `<g filter="url(#gl)">${body}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<defs>${shadowFilter(theme)}${glowFilter(theme)}</defs>
${body}
</svg>`;
}

/**
 * Body fill + outline. Each mode renders the same path differently — this is
 * what makes one pack a different object from another rather than a recolour.
 */
function solid(t, d) {
  // miterlimit 2 bevels the very sharp joins. Left at the default of 4 they
  // grow spikes long enough to bridge a concave notch and seal it shut.
  const join = `stroke-linejoin="${t.join || 'round'}" stroke-linecap="round" stroke-miterlimit="2"`;
  switch (t.mode) {
    // The outline is added later by quantising the raster, so draw fill only.
    case 'pixel':
      return `<path d="${d}" fill="${t.body}"/>`;

    // Nothing inside: a contrast halo keeps it readable on light wallpapers.
    case 'hollow':
      return `<path d="${d}" fill="none" stroke="${t.halo}" stroke-width="${t.lineWidth + 5}" ${join}/>
<path d="${d}" fill="none" stroke="${t.line}" stroke-width="${t.lineWidth}" ${join}/>`;

    // A fat round stroke in the fill colour swells the silhouette and rounds
    // every corner at once, which no amount of path editing would do cleanly.
    case 'soft':
      return `<path d="${d}" fill="${t.line}" stroke="${t.line}" stroke-width="${t.fat + t.lineWidth * 2}" stroke-linejoin="round" stroke-linecap="round"/>
<path d="${d}" fill="${t.body}" stroke="${t.body}" stroke-width="${t.fat}" stroke-linejoin="round" stroke-linecap="round"/>`;

    // Outline by union, not by a centred stroke: paint the shape once swollen
    // in the outline colour, then again at true size in the body colour. A
    // centred stroke would draw a seam along every internal edge of a shape
    // made of several subpaths, and would eat `lineWidth/2` into the artwork.
    // stroke-width is the full outline weight: a centred stroke only puts half
    // of it outside the path, which is exactly the visible thickness we want.
    default:
      return `<path d="${d}" fill="${t.line}" stroke="${t.line}" stroke-width="${t.lineWidth}" ${join}/>
<path d="${d}" fill="${t.body}"/>`;
  }
}

/** Stroke-only shape: wide outline underneath, body colour on top. */
function stroked(t, d, w) {
  if (t.mode === 'pixel') {
    return `<path d="${d}" fill="none" stroke="${t.body}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  const outer = t.mode === 'hollow' ? t.halo : t.line;
  const inner = t.mode === 'hollow' ? t.line : t.body;
  const width = t.mode === 'soft' ? w + t.fat * 0.5 : w;
  return `<path d="${d}" fill="none" stroke="${outer}" stroke-width="${width + t.lineWidth * 2}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${inner}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * Circular badge hanging off the arrow: help / person / pin.
 * Always filled, even in hollow mode — a hollow badge with a glyph inside is
 * unreadable at 32px.
 */
function badge(t, cx, cy, r, glyph) {
  const ring = t.mode === 'pixel'
    ? ''
    : ` stroke="${t.mode === 'hollow' ? t.halo : t.line}" stroke-width="${t.lineWidth}"`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${t.accent}"${ring}/>
<g transform="translate(${cx} ${cy})" fill="${t.onAccent}" stroke="${t.onAccent}">${glyph}</g>`;
}

const QUESTION = `<path d="M-11 -8 A11 11 0 1 1 1 4 L1 9" fill="none" stroke-width="7" stroke-linecap="round"/>
<circle cx="1" cy="19" r="4.5" stroke="none"/>`;

const PERSON = `<circle cx="0" cy="-9" r="8.5" stroke="none"/>
<path d="M-14 16 C-14 4 -7 0 0 0 C7 0 14 4 14 16 Z" stroke="none"/>`;

const PIN = `<path d="M0 -16 C7 -16 12 -11 12 -4 C12 5 0 18 0 18 C0 18 -12 5 -12 -4 C-12 -11 -7 -16 0 -16 Z" stroke="none"/>
<circle cx="0" cy="-4" r="4.5" fill="#000" fill-opacity="0.32" stroke="none"/>`;

/** Double-headed arrow on the vertical axis; rotated for the other three. */
const DOUBLE_V = 'M64 8 L88 41 L72 41 L72 87 L88 87 L64 120 L40 87 L56 87 L56 41 L40 41 Z';

/**
 * Connected four-way arrow. The notches between the arms are 24 units wide and
 * deep on purpose: anything tighter gets sealed shut by the outline swell in
 * soft mode, which traps a dark pocket inside the silhouette.
 */
const FOURWAY = [
  'M64 6 L82 30 L72 30 L72 56 L98 56 L98 46 L122 64 L98 82 L98 72 L72 72',
  'L72 98 L82 98 L64 122 L46 98 L56 98 L56 72 L30 72 L30 82 L6 64 L30 46',
  'L30 56 L56 56 L56 30 L46 30 Z',
].join(' ');

const HAND = [
  'M46 26 A9 9 0 0 1 64 26',
  'L64 58 A8 8 0 0 1 80 58',
  'L80 64 A8 8 0 0 1 96 64',
  'L96 70 A8 8 0 0 1 112 70',
  'L112 94 C112 110 98 120 82 120',
  'L60 120 C42 120 34 108 31 95',
  'L21 76 C17 68 27 61 33 67',
  'L46 80 Z',
].join(' ');

const PEN = [
  'M8 8 L34 20 L110 96',
  'C114 100 114 106 110 110 C106 114 100 114 96 110',
  'L20 34 Z',
].join(' ');

/**
 * Hairline detail lines — pen ferrule, finger creases.
 * Dropped in pixel mode, where a 32-cell grid turns them into noise.
 */
function detail(t, d, scale = 0.62, opacity = 0.75) {
  if (t.mode === 'pixel') return '';
  return `<g stroke="${t.line}" stroke-width="${t.lineWidth * scale}" stroke-linecap="round" fill="none" opacity="${opacity}">${d}</g>`;
}

/** Stroke in the danger colour with the pack's usual contrast treatment. */
function dangerStroke(t, d, w) {
  if (t.mode === 'pixel') {
    return `<path d="${d}" fill="none" stroke="${t.danger}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  const outer = t.mode === 'hollow' ? t.halo : t.line;
  return `<path d="${d}" fill="none" stroke="${outer}" stroke-width="${w + t.lineWidth * 2}" stroke-linecap="round"/>
<path d="${d}" fill="none" stroke="${t.danger}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** One spinner frame: outlined ring with a bright leading head. */
function spinner(t, angle, scale = 1, cx = 64, cy = 64) {
  const w = 14;
  const inner = `<g transform="rotate(${angle} 64 64)">
${stroked(t, ARC_TAIL, w)}
<path d="${ARC_HEAD}" fill="none" stroke="${t.accent}" stroke-width="${w}" stroke-linecap="round"/>
</g>`;
  if (scale === 1) return inner;
  return `<g transform="translate(${cx - 64 * scale} ${cy - 64 * scale}) scale(${scale})">${inner}</g>`;
}

/**
 * Every cursor role in a Windows scheme.
 * `hx`/`hy` are the normalised hotspot; `frames` marks animated roles.
 */
export const CURSORS = {
  pointer: {
    file: 'pointer.cur', role: 'Arrow', label: 'Normal select',
    hx: 8 / 128, hy: 8 / 128,
    draw: (t) => solid(t, ARROW),
  },

  help: {
    file: 'help.cur', role: 'Help', label: 'Help select',
    hx: 8 / 128, hy: 8 / 128,
    draw: (t) => `<g transform="translate(8 8) scale(0.72) translate(-8 -8)">${solid(t, ARROW)}</g>
${badge(t, 90, 46, 30, QUESTION)}`,
  },

  work: {
    file: 'work.ani', role: 'AppStarting', label: 'Working in background',
    hx: 8 / 128, hy: 8 / 128, frames: 12,
    draw: (t, f) => `<g transform="translate(8 8) scale(0.68) translate(-8 -8)">${solid(t, ARROW)}</g>
${spinner(t, f * 30, 0.5, 88, 84)}`,
  },

  busy: {
    file: 'busy.ani', role: 'Wait', label: 'Busy',
    hx: 0.5, hy: 0.5, frames: 12,
    draw: (t, f) => spinner(t, f * 30),
  },

  cross: {
    file: 'cross.cur', role: 'Crosshair', label: 'Precision select',
    hx: 0.5, hy: 0.5,
    // Arms stop 13 units short of the centre so the gap survives the outline
    // swell — a crosshair whose arms fuse into a plus loses its aiming point.
    draw: (t) => [
      solid(t, 'M57 8 H71 V44 H57 Z'),
      solid(t, 'M57 84 H71 V120 H57 Z'),
      solid(t, 'M8 57 H44 V71 H8 Z'),
      solid(t, 'M84 57 H120 V71 H84 Z'),
      badge(t, 64, 64, 7, ''),
    ].join('\n'),
  },

  text: {
    file: 'text.cur', role: 'IBeam', label: 'Text select',
    hx: 0.5, hy: 0.5,
    draw: (t) => solid(t, 'M44 14 H84 V27 H70 V101 H84 V114 H44 V101 H58 V27 H44 Z'),
  },

  handwriting: {
    file: 'handwriting.cur', role: 'NWPen', label: 'Handwriting',
    hx: 8 / 128, hy: 8 / 128,
    draw: (t) => `${solid(t, PEN)}
${detail(t, '<path d="M40 26 L26 40"/>', 1, 1)}`,
  },

  unavailiable: {
    file: 'unavailiable.cur', role: 'No', label: 'Unavailable',
    hx: 0.5, hy: 0.5,
    draw: (t) => `${dangerStroke(t, 'M108 64 A44 44 0 1 1 20 64 A44 44 0 1 1 108 64', 18)}
${dangerStroke(t, 'M33 33 L95 95', 18)}`,
  },

  vert: {
    file: 'vert.cur', role: 'SizeNS', label: 'Resize vertical',
    hx: 0.5, hy: 0.5,
    draw: (t) => solid(t, DOUBLE_V),
  },

  horz: {
    file: 'horz.cur', role: 'SizeWE', label: 'Resize horizontal',
    hx: 0.5, hy: 0.5,
    draw: (t) => `<g transform="rotate(90 64 64)">${solid(t, DOUBLE_V)}</g>`,
  },

  dgn1: {
    file: 'dgn1.cur', role: 'SizeNWSE', label: 'Resize diagonal 1',
    hx: 0.5, hy: 0.5,
    draw: (t) => `<g transform="rotate(-45 64 64)">${solid(t, DOUBLE_V)}</g>`,
  },

  dgn2: {
    file: 'dgn2.cur', role: 'SizeNESW', label: 'Resize diagonal 2',
    hx: 0.5, hy: 0.5,
    draw: (t) => `<g transform="rotate(45 64 64)">${solid(t, DOUBLE_V)}</g>`,
  },

  move: {
    file: 'move.cur', role: 'SizeAll', label: 'Move',
    hx: 0.5, hy: 0.5,
    draw: (t) => solid(t, FOURWAY),
  },

  alternate: {
    file: 'alternate.cur', role: 'UpArrow', label: 'Alternate select',
    hx: 0.5, hy: 8 / 128,
    draw: (t) => solid(t, 'M64 8 L98 56 L78 56 L78 112 L50 112 L50 56 L30 56 Z'),
  },

  link: {
    file: 'link.cur', role: 'Hand', label: 'Link select',
    hx: 55 / 128, hy: 16 / 128,
    draw: (t) => `${solid(t, HAND)}
${detail(t, '<path d="M64 64 L64 82"/><path d="M80 70 L80 87"/><path d="M96 76 L96 91"/>')}`,
  },

  pin: {
    file: 'pin.cur', role: 'Pin', label: 'Location select',
    hx: 8 / 128, hy: 8 / 128,
    draw: (t) => `<g transform="translate(8 8) scale(0.72) translate(-8 -8)">${solid(t, ARROW)}</g>
${badge(t, 90, 46, 30, PIN)}`,
  },

  person: {
    file: 'person.cur', role: 'Person', label: 'Person select',
    hx: 8 / 128, hy: 8 / 128,
    draw: (t) => `<g transform="translate(8 8) scale(0.72) translate(-8 -8)">${solid(t, ARROW)}</g>
${badge(t, 90, 46, 30, PERSON)}`,
  },
};
