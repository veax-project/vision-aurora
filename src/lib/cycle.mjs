/**
 * Outline colour cycle.
 *
 * Walks a loop of anchor colours and returns the colour at any point in it.
 * Eased at each anchor so the drift slows as it arrives and leaves, which is
 * what keeps a ten-frame loop from reading as ten discrete steps.
 */

function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function hex(c) {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

const ease = (t) => t * t * (3 - 2 * t);

/**
 * @param {string[]} anchors  colours to walk through, looping back to the first
 * @param {number}   phase    position in the loop, 0..1
 */
export function cycleColour(anchors, phase) {
  const n = anchors.length;
  const t = ((phase % 1) + 1) % 1 * n;
  const i = Math.floor(t);
  const k = ease(t - i);
  const a = rgb(anchors[i % n]);
  const b = rgb(anchors[(i + 1) % n]);
  return hex(a.map((v, j) => v + (b[j] - v) * k));
}

/** The colour for frame `f` of an `n`-frame loop. */
export function frameColour(anchors, f, n) {
  return cycleColour(anchors, f / n);
}
