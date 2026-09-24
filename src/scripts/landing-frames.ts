// Surfer frames F00-F11, as paths inside public/. Replace an entry to swap in a real frame.
export const FRAMES: readonly string[] = [
  'surfer/f00.webp', // F00 rest, seated
  'surfer/f00.webp', // F01 head lifts, hand plants
  'surfer/f00.webp', // F02 pushing up, crouched
  'surfer/f00.webp', // F03 mid-hop
  'surfer/f00.webp', // F04 lands standing
  'surfer/f00.webp', // F05 hero stance
  'surfer/f00.webp', // F06 turning, 3/4 front
  'surfer/f00.webp', // F07 profile, facing left
  'surfer/f00.webp', // F08 3/4 back, facing up-left
  'surfer/f00.webp', // F09 launch
  'surfer/f00.webp', // F10 full flight away
  'surfer/f00.webp', // F11 settle
];

// Where the surfer sits inside the logo box (fractions of the box), measured from the artwork.
export const LOGO_SURFER = { left: 0.03443, top: 0, width: 0.60586, height: 0.8454 };
