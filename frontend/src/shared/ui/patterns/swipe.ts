/** A flick faster than this (px/s) opens or closes the card regardless of distance. */
const FLING_VELOCITY = 500;

/**
 * Whether a swiped card settles open after the finger lifts. `position` is where the
 * card was let go (0 = closed, -revealed = fully open). Past half the actions' width, or
 * flicked, it opens; otherwise it closes. It always settles at one end, never in between.
 */
export function settlesOpen(position: number, velocity: number, revealed: number): boolean {
  if (velocity < -FLING_VELOCITY) {
    return true;
  }
  if (velocity > FLING_VELOCITY) {
    return false;
  }
  return position < -revealed / 2;
}
