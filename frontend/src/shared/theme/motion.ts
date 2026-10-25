/**
 * Motion tokens. Motion is calm and purposeful: it orients, gives feedback and shows
 * continuity, and never delays the user. Durations are in seconds, Motion's unit.
 */

export const duration = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
} as const;

type CubicBezier = readonly [number, number, number, number];

export const ease = {
  /** Elements that move from one place on screen to another. */
  standard: [0.2, 0, 0, 1],
  /** Elements entering: they start fast and settle. */
  enter: [0, 0, 0, 1],
  /** Elements leaving: they accelerate away. */
  exit: [0.3, 0, 1, 1],
} as const satisfies Record<string, CubicBezier>;

export function cssEasing(curve: CubicBezier): string {
  return `cubic-bezier(${curve.join(", ")})`;
}

export function cssDuration(seconds: number): string {
  return `${String(seconds)}s`;
}

/** The motion tokens as CSS custom properties, for animations defined in style sheets. */
export function motionVariables(): Record<string, string> {
  return {
    "--grc-duration-fast": cssDuration(duration.fast),
    "--grc-duration-base": cssDuration(duration.base),
    "--grc-duration-slow": cssDuration(duration.slow),
    "--grc-ease-standard": cssEasing(ease.standard),
    "--grc-ease-enter": cssEasing(ease.enter),
    "--grc-ease-exit": cssEasing(ease.exit),
  };
}
