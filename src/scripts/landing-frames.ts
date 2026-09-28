// Surfer pose sequence: the six hand-drawn key poses plus generated in-between frames.
// Every frame shares one canvas, placed around the logo surfer's box (fractions of that box).
export const FRAME_COUNT = 35;
export const FRAMES: readonly string[] = Array.from({ length: FRAME_COUNT }, (_, i) => `surfer/seq/pose-${String(i).padStart(2, '0')}.webp`);
export const FRAME_SIZE = { width: 898, height: 1000 };
export const CANVAS = { left: -0.05410, top: -0.17269, width: 1.06905, height: 1.18708 };

// Each pose change in Sequence A: [start, end, frames played in order]. Key drawings: 0 rest (the logo pose),
// 7 crouch, 14 rise, 18 stand, 22 launch, 29 seated. The frames in between are the generated in-betweens.
const run = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const POSE_CHANGES: readonly [number, number, readonly number[]][] = [
  [0.015, 0.055, run(0, 7)],
  [0.06, 0.105, run(7, 14)],
  [0.13, 0.17, run(14, 18)],
  [0.22, 0.28, run(18, 22)],
  [0.78, 0.87, run(22, 29)],
  [0.87, 0.92, [...run(29, 34), 0]],
];

// Where the surfer sits inside the logo box (fractions of the box), measured from the artwork.
export const LOGO_SURFER = { left: 0.03443, top: 0, width: 0.60586, height: 0.8454 };
