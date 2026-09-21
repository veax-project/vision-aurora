/**
 * Readers for existing .cur and .ani files.
 *
 * Lets a pack be remixed from its own shipped artwork rather than redrawn:
 * the shapes stay exactly as they were, only the outline is retouched.
 */

/** Parses a .cur / .ico into its images, as straight-alpha RGBA. */
export function readCur(buf) {
  const count = buf.readUInt16LE(4);
  const images = [];

  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const width = buf[e] || 256;
    const height = buf[e + 1] || 256;
    const hotspotX = buf.readUInt16LE(e + 4);
    const hotspotY = buf.readUInt16LE(e + 6);
    const offset = buf.readUInt32LE(e + 12);

    const headerSize = buf.readUInt32LE(offset);
    const bpp = buf.readUInt16LE(offset + 14);
    if (bpp !== 32) {
      throw new Error(`only 32bpp cursors can be remixed, found ${bpp}bpp`);
    }

    // DIB rows are bottom-up BGRA; the AND mask after them is redundant here
    // because the alpha channel already carries the transparency.
    const pixels = offset + headerSize;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      const src = pixels + (height - 1 - y) * width * 4;
      for (let x = 0; x < width; x++) {
        const s = src + x * 4;
        const d = (y * width + x) * 4;
        rgba[d] = buf[s + 2];
        rgba[d + 1] = buf[s + 1];
        rgba[d + 2] = buf[s];
        rgba[d + 3] = buf[s + 3];
      }
    }
    images.push({ width, height, rgba, hotspotX, hotspotY });
  }
  return images;
}

/** Parses a .ani into its frames, each still a complete .cur buffer. */
export function readAni(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'ACON') {
    throw new Error('not a RIFF/ACON animated cursor');
  }

  const frames = [];
  let jiffies = 5;
  let p = 12;

  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);

    if (id === 'anih') {
      jiffies = buf.readUInt32LE(p + 8 + 28) || 5;
    } else if (id === 'LIST' && buf.toString('ascii', p + 8, p + 12) === 'fram') {
      let q = p + 12;
      while (q + 8 <= p + 8 + size) {
        const chunkId = buf.toString('ascii', q, q + 4);
        const chunkSize = buf.readUInt32LE(q + 4);
        if (chunkId === 'icon') frames.push(buf.subarray(q + 8, q + 8 + chunkSize));
        q += 8 + chunkSize + (chunkSize % 2);
      }
    }
    p += 8 + size + (size % 2);
  }

  if (!frames.length) throw new Error('animated cursor has no frames');
  return { frames, jiffies };
}
