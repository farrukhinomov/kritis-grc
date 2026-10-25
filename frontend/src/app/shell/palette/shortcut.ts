/** Apple keyboards say Cmd where the others say Ctrl; iPadOS reports itself as a Mac. */
export function isApple(): boolean {
  return /Mac|iPhone|iPad/.test(globalThis.navigator.userAgent);
}

/**
 * Cmd+K on Apple keyboards, Ctrl+K elsewhere: on a Mac, Ctrl+K deletes to the end of the
 * line in text fields and stays the system's. Shift or Alt make it another shortcut, and
 * a key pressed while an input method composes a word belongs to the word.
 */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  const modifier = isApple() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return (
    modifier &&
    !event.shiftKey &&
    !event.altKey &&
    !event.isComposing &&
    event.key.toLowerCase() === "k"
  );
}
