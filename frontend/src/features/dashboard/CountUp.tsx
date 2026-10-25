import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { duration, ease } from "@/shared/theme/motion";

interface CountUpProps {
  value: number;
  format: (value: number) => string;
}

/**
 * A number that counts up to its value, so a change on the dashboard is noticed. Screen
 * readers get only the final value, and with reduced motion it simply appears.
 */
export function CountUp({ value, format }: CountUpProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [counted, setCounted] = useState(0);
  const from = useRef(0);
  const shown = reduceMotion ? value : counted;

  useEffect(() => {
    if (reduceMotion) {
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: duration.slow * 3,
      ease: ease.enter,
      onUpdate: (latest) => {
        setCounted(Math.round(latest));
      },
    });
    from.current = value;
    return () => {
      controls.stop();
    };
  }, [value, reduceMotion]);

  return (
    <>
      <span aria-hidden>{format(shown)}</span>
      <span className="grc-visually-hidden">{format(value)}</span>
    </>
  );
}
