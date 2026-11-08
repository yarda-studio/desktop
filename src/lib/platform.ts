/**
 * Which keyboard the user has, so shortcut hints can say Cmd on a Mac and Ctrl
 * everywhere else. The shortcuts themselves already accept either key (their
 * handlers check `ctrlKey || metaKey`); this only changes what the UI prints.
 * One build serves every platform: this is decided at runtime, not at build time.
 */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Rewrites the modifier names in `text` for the current keyboard: "Ctrl" becomes
 * "Cmd" and "Alt" becomes "Option" on a Mac, and nothing changes elsewhere.
 * Works on a bare combo ("Ctrl+Shift+K") or a sentence that mentions one.
 */
export function forPlatform(text: string, mac: boolean = IS_MAC): string {
  return mac ? text.replace(/\bCtrl\b/g, "Cmd").replace(/\bAlt\b/g, "Option") : text;
}
