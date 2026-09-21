import { Resvg } from '@resvg/resvg-js';

/** resvg renders premultiplied; .cur DIBs want straight alpha. */
function unpremultiply(px) {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0 || a === 255) continue;
    px[i] = Math.min(255, Math.round((px[i] * 255) / a));
    px[i + 1] = Math.min(255, Math.round((px[i + 1] * 255) / a));
    px[i + 2] = Math.min(255, Math.round((px[i + 2] * 255) / a));
  }
  return px;
}

function render(svg, size) {
  const img = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  }).render();
  return { width: img.width, height: img.height, rgba: unpremultiply(Buffer.from(img.pixels)) };
}

function hex(c) {
  return [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
}

/**
 * Pixel mode.
 *
 * Renders small, hard-thresholds the alpha so nothing is antialiased, grows a
 * one-cell outline around whatever survived, then scales up by an integer
 * factor with nearest-neighbour so cells stay perfectly square.
 */
function pixelize(svg, size, grid, outlineColour) {
  const factor = size / grid;
  if (!Number.isInteger(factor)) {
    throw new Error(`pixel mode needs size (${size}) to be a multiple of grid (${grid})`);
  }

  const small = render(svg, grid).rgba;
  const n = grid * grid;

  // Hard threshold: a cell is either fully on or fully off.
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (small[i * 4 + 3] >= 128) filled[i] = 1;
    else small.writeUInt32LE(0, i * 4);
  }

  // One-cell dilation, 4-connected, painted in the outline colour.
  const [r, g, b] = hex(outlineColour);
  const grown = Buffer.from(small);
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const i = y * grid + x;
      if (filled[i]) continue;
      const touches =
        (x > 0 && filled[i - 1]) ||
        (x < grid - 1 && filled[i + 1]) ||
        (y > 0 && filled[i - grid]) ||
        (y < grid - 1 && filled[i + grid]);
      if (!touches) continue;
      grown[i * 4] = r;
      grown[i * 4 + 1] = g;
      grown[i * 4 + 2] = b;
      grown[i * 4 + 3] = 255;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = (y / factor) | 0;
    for (let x = 0; x < size; x++) {
      const sx = (x / factor) | 0;
      grown.copy(out, (y * size + x) * 4, (sy * grid + sx) * 4, (sy * grid + sx) * 4 + 4);
    }
  }
  return { width: size, height: size, rgba: out };
}

/**
 * Rasterise an SVG string to straight-alpha RGBA at `size`.
 * Pass `{ grid, outline }` to quantise the result to a pixel grid instead.
 */
export function rasterize(svg, size, opts = {}) {
  if (opts.grid) return pixelize(svg, size, opts.grid, opts.outline);
  return render(svg, size);
}
