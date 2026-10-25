import type { SemanticTokens } from "./semantic";

interface TokenTree {
  readonly [key: string]: string | TokenTree;
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function flatten(tree: TokenTree, prefix: string): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const name = `${prefix}-${kebab(key)}`;
    return typeof value === "string" ? [[name, value]] : flatten(value, name);
  });
}

/**
 * The semantic tokens as CSS custom properties (`--grc-sidebar-active-bg`), for style
 * sheets that can't read React context: the focus ring, the shell and the patterns.
 */
export function cssVariables(tokens: SemanticTokens): Record<string, string> {
  return Object.fromEntries(flatten(tokens as unknown as TokenTree, "--grc"));
}
