/**
 * Retouches an existing cursor image: thins the outline and tints it.
 *
 * Works on the shipped artwork directly, so the shapes are untouched — only
 * the ring of outline pixels around them changes.
 *
 * Two details that a naive version gets wrong:
 *
 *   - The body colour is read from the artwork, not assumed. A pack whose fill
 *     is dark navy rather than black would otherwise get near-black speckles
 *     wherever the outline was eroded.
 *   - Tinting is proportional to how light a pixel is. Edges are antialiased as
 *     blends between the outline and the fill, so recolouring only the pure
 *     white pixels would leave a pale fringe of the old colour around every
 *     tinted edge.
 */

const BRIGHT = 190;
const DARK = 96;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function classify(rgba, i) {
  if (rgba[i + 3] < 24) return 'clear';
  const r = rgba[i];
  const g = rgba[i + 1];
  const b = rgba[i + 2];
  if (r >= BRIGHT && g >= BRIGHT && b >= BRIGHT) return 'outline';
  if (r <= DARK && g <= DARK && b <= DARK) return 'body';
  return 'blend';
}

/** The darkest opaque colour present — the pack's actual fill. */
export function sampleBody(image) {
  const { rgba } = image;
  let best = null;
  let bestLuma = Infinity;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 250) continue;
    const l = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (l < bestLuma) {
      bestLuma = l;
      best = [rgba[i], rgba[i + 1], rgba[i + 2]];
    }
  }
  return best || [0, 0, 0];
}

/**
 * @param {{width:number,height:number,rgba:Buffer}} image
 * @param {object} opts
 * @param {number} opts.thin    outline pixels to erode from the inner side
 * @param {string} opts.colour  hex the outline is tinted to
 * @param {number[]} [opts.bodyRef]  fill colour; sampled from the image if absent
 */
export function retouch(image, { thin = 0, colour = null, bodyRef = null } = {}) {
  const { width, height } = image;
  const rgba = Buffer.from(image.rgba);
  const n = width * height;
  const fill = bodyRef || sampleBody(image);

  // Erode from the inside: an outline pixel touching the fill takes that
  // neighbour's exact colour, so the ring loses a pixel against the fill while
  // the outer silhouette and its antialiasing stay untouched.
  for (let pass = 0; pass < thin; pass++) {
    const kind = new Array(n);
    for (let p = 0; p < n; p++) kind[p] = classify(rgba, p * 4);

    const doomed = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (kind[p] !== 'outline') continue;
        const sources = [];
        if (x > 0 && kind[p - 1] === 'body') sources.push(p - 1);
        if (x < width - 1 && kind[p + 1] === 'body') sources.push(p + 1);
        if (y > 0 && kind[p - width] === 'body') sources.push(p - width);
        if (y < height - 1 && kind[p + width] === 'body') sources.push(p + width);
        if (sources.length) doomed.push([p, sources[0]]);
      }
    }
    for (const [p, src] of doomed) {
      rgba[p * 4] = rgba[src * 4];
      rgba[p * 4 + 1] = rgba[src * 4 + 1];
      rgba[p * 4 + 2] = rgba[src * 4 + 2];
    }
  }

  // Tint. Every pixel sits somewhere on the line from fill to outline, so move
  // it the same proportion of the way from fill to the target colour. Pure fill
  // stays exactly as it was; a half-blended edge pixel stays half-blended.
  if (colour) {
    const target = rgb(colour);
    const fillLuma = luma(fill[0], fill[1], fill[2]);
    const span = Math.max(1, 255 - fillLuma);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      if (rgba[i + 3] === 0) continue;
      const t = (luma(rgba[i], rgba[i + 1], rgba[i + 2]) - fillLuma) / span;
      if (t <= 0.02) continue;
      const k = Math.min(1, t);
      for (let ch = 0; ch < 3; ch++) {
        rgba[i + ch] = Math.round(fill[ch] + (target[ch] - fill[ch]) * k);
      }
    }
  }

  return { ...image, rgba };
}
