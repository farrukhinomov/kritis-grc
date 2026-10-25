/**
 * WCAG 2.2 contrast math. Used by the token tests, so every Theme is checked against the
 * same formula an accessibility audit would use.
 */

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function channels(hex: string): [number, number, number] {
  const match = HEX_COLOR.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Expected an opaque hex color like #1A2B3C, got "${hex}"`);
  }
  const digits = match[1].length === 3 ? match[1].replace(/./g, (d) => d + d) : match[1];
  return [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Normal-size text (WCAG 1.4.3, AA). */
export const TEXT_CONTRAST = 4.5;
/** Component boundaries, focus indicators and meaningful graphics (WCAG 1.4.11, AA). */
export const NON_TEXT_CONTRAST = 3;
