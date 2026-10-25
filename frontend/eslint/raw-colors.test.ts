import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import { RAW_COLOR_SELECTORS } from "./raw-colors.js";

const linter = new Linter({ configType: "flat" });

function rawColorErrors(code: string): number {
  return linter.verify(
    code,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: { "no-restricted-syntax": ["error", ...RAW_COLOR_SELECTORS] },
      },
    ],
    { filename: "component.tsx" },
  ).length;
}

describe("the raw-color lint rule", () => {
  it.each([
    ["a hex string", 'const c = "#3A8B71";'],
    ["a color function", 'const c = "rgba(0, 0, 0, 0.4)";'],
    ["a modern color function", 'const c = "oklch(70% 0.1 160)";'],
    ["hex inside a template literal", "const border = `1px solid #ddd`;"],
    ["a color function inside a template literal", "const shadow = `0 1px 2px rgb(0 0 0)`;"],
    ["a named color in a style property", 'const style = { color: "white" };'],
    ["a named color in a template style value", "const style = { border: `1px solid red` };"],
    ["a named color inside a shorthand value", 'const style = { border: "1px solid red" };'],
    ["a named color on a JSX color prop", 'const tag = <Tag color="volcano" />;'],
  ])("rejects %s", (_, code) => {
    expect(rawColorErrors(code)).toBe(1);
  });

  it.each([
    ["a token reference", "const style = { color: token.colorText };"],
    ["a CSS variable", 'const style = { background: "var(--grc-surface)" };'],
    ["color keywords", 'const style = { color: "currentColor", background: "transparent" };'],
    ["a color word in ordinary text", 'const label = "Orange juice";'],
    ["an in-page anchor", "const href = `#${id}`;"],
    ["a semantic antd status", 'const tag = <Tag color="success" />;'],
  ])("allows %s", (_, code) => {
    expect(rawColorErrors(code)).toBe(0);
  });
});
