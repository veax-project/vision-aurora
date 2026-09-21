/**
 * Windows .cur / .ico writer.
 *
 * Layout: ICONDIR -> ICONDIRENTRY[n] -> for each image a BITMAPINFOHEADER with
 * biHeight doubled (XOR bitmap + AND mask), 32bpp BGRA rows stored bottom-up,
 * then a 1bpp AND mask whose rows are padded to 4 bytes.
 */

function dibFromRgba(width, height, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);          // biSize
  header.writeInt32LE(width, 4);        // biWidth
  header.writeInt32LE(height * 2, 8);   // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12);          // biPlanes
  header.writeUInt16LE(32, 14);         // biBitCount
  header.writeUInt32LE(0, 16);          // biCompression = BI_RGB

  const xor = Buffer.alloc(width * height * 4);
  const maskStride = (((width + 31) >> 5) << 2); // 1bpp rows padded to 4 bytes
  const and = Buffer.alloc(maskStride * height);

  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = (height - 1 - y) * width * 4;      // flip vertically
    const maskRow = (height - 1 - y) * maskStride;
    for (let x = 0; x < width; x++) {
      const s = src + x * 4;
      const d = dst + x * 4;
      const a = rgba[s + 3];
      xor[d] = rgba[s + 2];     // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s];     // R
      xor[d + 3] = a;
      if (a === 0) and[maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, xor, and]);
}

/**
 * @param {{width:number,height:number,rgba:Buffer,hotspotX:number,hotspotY:number}[]} images
 * @param {'cursor'|'icon'} kind
 */
export function buildCur(images, kind = 'cursor') {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(kind === 'cursor' ? 2 : 1, 2);
  dir.writeUInt16LE(images.length, 4);

  const blobs = images.map((i) => dibFromRgba(i.width, i.height, i.rgba));
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;

  images.forEach((img, i) => {
    const o = i * 16;
    entries[o] = img.width >= 256 ? 0 : img.width;
    entries[o + 1] = img.height >= 256 ? 0 : img.height;
    entries[o + 2] = 0; // colour count
    entries[o + 3] = 0; // reserved
    if (kind === 'cursor') {
      entries.writeUInt16LE(img.hotspotX, o + 4);
      entries.writeUInt16LE(img.hotspotY, o + 6);
    } else {
      entries.writeUInt16LE(1, o + 4);  // planes
      entries.writeUInt16LE(32, o + 6); // bpp
    }
    entries.writeUInt32LE(blobs[i].length, o + 8);
    entries.writeUInt32LE(offset, o + 12);
    offset += blobs[i].length;
  });

  return Buffer.concat([dir, entries, ...blobs]);
}
