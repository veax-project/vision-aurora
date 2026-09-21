/**
 * Animated cursor (.ani) writer — RIFF/ACON container.
 *
 * RIFF "ACON"
 *   LIST "INFO" { INAM, IART }
 *   anih (36 bytes)
 *   rate (one uint32 of jiffies per step, 1 jiffy = 1/60 s)
 *   seq  (one uint32 frame index per step)
 *   LIST "fram" { icon xN }   <- each icon chunk is a complete .cur payload
 *
 * Every chunk is word-aligned: odd payloads get a trailing pad byte that is
 * not counted in the declared size.
 */

function chunk(id, payload) {
  const head = Buffer.alloc(8);
  head.write(id.padEnd(4, ' '), 0, 4, 'ascii');
  head.writeUInt32LE(payload.length, 4);
  const parts = [head, payload];
  if (payload.length % 2) parts.push(Buffer.alloc(1));
  return Buffer.concat(parts);
}

function list(type, chunks) {
  const head = Buffer.alloc(4);
  head.write(type.padEnd(4, ' '), 0, 4, 'ascii');
  return chunk('LIST', Buffer.concat([head, ...chunks]));
}

function zstring(s) {
  return Buffer.concat([Buffer.from(s, 'latin1'), Buffer.alloc(1)]);
}

/**
 * @param {Buffer[]} frames  complete .cur buffers, one per frame
 * @param {object}   opts
 * @param {number}   opts.jiffies  display rate per frame (1/60 s units)
 * @param {string}   opts.name
 * @param {string}   opts.artist
 */
export function buildAni(frames, { jiffies = 5, name = '', artist = '' } = {}) {
  const n = frames.length;

  const anih = Buffer.alloc(36);
  anih.writeUInt32LE(36, 0);      // cbSize
  anih.writeUInt32LE(n, 4);       // nFrames
  anih.writeUInt32LE(n, 8);       // nSteps
  anih.writeUInt32LE(0, 12);      // iWidth  (0 = read from frame)
  anih.writeUInt32LE(0, 16);      // iHeight
  anih.writeUInt32LE(0, 20);      // iBitCount
  anih.writeUInt32LE(0, 24);      // nPlanes
  anih.writeUInt32LE(jiffies, 28) // iDispRate
  anih.writeUInt32LE(1, 32);      // bfAttributes: bit0 = frames are icon/cur data

  const rate = Buffer.alloc(4 * n);
  const seq = Buffer.alloc(4 * n);
  for (let i = 0; i < n; i++) {
    rate.writeUInt32LE(jiffies, i * 4);
    seq.writeUInt32LE(i, i * 4);
  }

  const info = [];
  if (name) info.push(chunk('INAM', zstring(name)));
  if (artist) info.push(chunk('IART', zstring(artist)));

  const body = Buffer.concat([
    Buffer.from('ACON', 'ascii'),
    ...(info.length ? [list('INFO', info)] : []),
    chunk('anih', anih),
    chunk('rate', rate),
    chunk('seq ', seq),
    list('fram', frames.map((f) => chunk('icon', f))),
  ]);

  return chunk('RIFF', body);
}
