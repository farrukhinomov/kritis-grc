export type SheetHeight = "closed" | "half" | "full";

/** Dragged above this share of the screen, the sheet opens fully. */
const FULL_THRESHOLD = 0.7;
/** Dragged below this share, the user is dismissing it. */
const CLOSE_THRESHOLD = 0.25;

/** Where a bottom sheet settles after its handle is let go at `height` pixels. */
export function snapSheetHeight(height: number, viewportHeight: number): SheetHeight {
  const share = height / viewportHeight;
  if (share >= FULL_THRESHOLD) {
    return "full";
  }
  if (share < CLOSE_THRESHOLD) {
    return "closed";
  }
  return "half";
}
