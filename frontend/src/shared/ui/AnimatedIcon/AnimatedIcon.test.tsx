import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";

import { AnimatedIcon } from "./AnimatedIcon";
import { ICON_PRESETS } from "./presets";

describe("AnimatedIcon", () => {
  it("hides decorative icons from assistive technology", () => {
    const { container } = render(<AnimatedIcon preset="refresh" />);

    const icon = container.querySelector("[data-animated-icon]");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("data-animated-icon", "spin");
  });

  it("names icons that carry meaning on their own", () => {
    render(<AnimatedIcon preset="warning" label="Achtung" />);

    expect(screen.getByRole("img", { name: "Achtung" })).toHaveAttribute(
      "data-animated-icon",
      "shake",
    );
  });

  it("renders the preset's icon at the requested size", () => {
    const { container } = render(<AnimatedIcon preset="plus" size={24} />);

    expect(container.querySelector("svg")).toHaveAttribute("width", "24");
  });
});

describe("the icon animation style sheet", () => {
  const css = readFileSync(resolve("src/shared/ui/AnimatedIcon/animated-icon.css"), "utf8");
  const [outsideMedia = "", ...mediaBlocks] = css.split("@media");

  it("only animates inside reduced-motion-aware media blocks", () => {
    expect(outsideMedia).not.toMatch(/animation\s*:/);
    expect(mediaBlocks.length).toBeGreaterThan(0);
    for (const block of mediaBlocks) {
      expect(block).toMatch(/^\s*\(prefers-reduced-motion: no-preference\)/);
    }
  });

  it("plays on hover only for precise pointers, so touch taps don't leave icons stuck", () => {
    const hoverBlocks = mediaBlocks.filter((block) => block.includes(":hover"));

    expect(hoverBlocks.length).toBeGreaterThan(0);
    for (const block of hoverBlocks) {
      expect(block).toContain("(hover: hover) and (pointer: fine)");
    }
  });

  it("defines a keyframe animation for every animation a preset uses", () => {
    const animations = new Set(Object.values(ICON_PRESETS).map((preset) => preset.animation));

    for (const animation of animations) {
      expect(css).toContain(`@keyframes grc-icon-${animation}`);
    }
  });
});
