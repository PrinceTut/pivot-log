// Surfer poses for the landing transition, generated from the artwork by the frame build.
// Every file shares one canvas with the board locked to the same centre, length and a level
// angle; `angle` is that pose's natural board tilt (degrees, positive = nose down to the left),
// restored at runtime by rotating the figure about the board centre, so blends never move the board.
export interface SurferPose { name: string; file: string; angle: number; }

export const POSES: readonly SurferPose[] = [
  { name: 'rest', file: 'surfer/pose-rest.webp', angle: 23.0 },
  { name: 'crouch', file: 'surfer/pose-crouch.webp', angle: -14.0 },
  { name: 'rise', file: 'surfer/pose-rise.webp', angle: -14.0 },
  { name: 'stand', file: 'surfer/pose-stand.webp', angle: -11.0 },
  { name: 'launch', file: 'surfer/pose-launch.webp', angle: -11.5 },
  { name: 'seated', file: 'surfer/pose-seated.webp', angle: 8.0 },
];

// Where the shared canvas sits relative to the logo-surfer box (fractions of that box),
// and the board centre the figure rotates around (fractions of the box).
export const CANVAS = { left: -0.22346, top: -0.45173, width: 1.46864, height: 1.61410 };
export const ORIGIN = { x: 0.55444, y: 0.67964 };

// Where the surfer sits inside the logo box (fractions of the box), measured from the artwork.
export const LOGO_SURFER = { left: 0.03443, top: 0, width: 0.60586, height: 0.8454 };
