/**
 * Aurora — one pack, shipped in two builds.
 *
 * The look: flat black body, thin outline, sharp angles. The outline drifts
 * very slowly between white, pastel mint and pastel cyan; the body never
 * changes, so the effect reads as a sheen on the edge rather than a colour.
 *
 * `aurora` animates every cursor, which means every file is a .ani — a .cur
 * holds one still image and cannot shift colour. `aurora-static` is the same
 * artwork with a fixed white outline, for anywhere animated cursors are
 * unwanted or ignored.
 */

/** Anchors the outline drifts through, looping back to the first. */
export const OUTLINE_CYCLE = ['#FFFFFF', '#C9F7DE', '#C4F0F8'];

const SHARED = {
  mode: 'edge',
  join: 'miter',
  // 6 on the 128 grid lands on a 1px outline at 32px — half of what the
  // reference packs use, measured rather than guessed.
  lineWidth: 6,
  body: '#0B0B0F',
  line: '#FFFFFF',
  accent: '#FFFFFF',
  onAccent: '#0B0B0F',
  danger: '#FF4356',
  shadow: 0.38,
};

export const THEMES = [
  {
    ...SHARED,
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Black body, thin outline that drifts through mint and cyan.',
    animateAll: true,
    cycle: OUTLINE_CYCLE,
    // 10 frames x 48 jiffies = an 8 second loop. Slow enough that the change
    // is never the thing you notice, only something you catch now and then.
    cycleFrames: 10,
    cycleJiffies: 48,
    sizes: [32, 48, 64, 96],
  },
  {
    ...SHARED,
    id: 'aurora-static',
    name: 'Aurora Static',
    tagline: 'Same artwork, fixed white outline, plain .cur files.',
    sizes: [32, 48, 64, 96, 128],
  },
];
