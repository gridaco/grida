import { KeyCode, KeyCodeUtils } from "./keycode";

/**
 * Modifier bitmask flags
 * Use bitwise OR to combine: M.Ctrl | M.Shift
 */
export const enum M {
  Ctrl = 1 << 0,
  Shift = 1 << 1,
  Alt = 1 << 2,
  Meta = 1 << 3,
  /**
   * CmdOrCtrl: resolves to Meta on mac, Ctrl on windows/linux
   * Use this instead of platformKb() for most cross-platform bindings
   */
  CtrlCmd = 1 << 4,
}

/**
 * A single keybinding chunk
 * Represents keys pressed together with optional modifiers
 * Format: [modsBitmask, ...keys]
 *
 * Examples:
 * - [0, KeyCode.Digit0] - single key press
 * - [M.Meta, KeyCode.KeyR] - CMD+R (mac only)
 * - [M.CtrlCmd, KeyCode.KeyR] - CMD+R on mac, Ctrl+R on win/linux
 */
export type Chunk = readonly [mods: number, ...keys: KeyCode[]];

/**
 * A keybinding sequence
 * Represents a sequence of chunks that must be pressed in order
 *
 * Examples:
 * - [[0, KeyCode.Digit0], [0, KeyCode.Digit0]] - double press 0
 * - [[M.CtrlCmd, KeyCode.KeyR], [M.CtrlCmd, KeyCode.KeyS]] - CMD+R then CMD+S
 */
export type Sequence = readonly Chunk[];

/**
 * A keybinding can be:
 * - A single sequence: [[M.CtrlCmd, KeyCode.KeyA]]
 * - Multiple sequences (aliases): [
 *     [[M.Meta, KeyCode.KeyA]],
 *     [[M.Ctrl, KeyCode.KeyA]]
 *   ]
 */
export type Keybinding = Sequence | readonly Sequence[];

/**
 * Platform-specific keybindings
 * Can be a single keybinding (applies to all platforms) or an object with platform-specific bindings
 */
export type Keybindings =
  | Keybinding
  | {
      mac?: Keybinding;
      windows?: Keybinding;
      linux?: Keybinding;
    };

/**
 * Resolved chunk structure for display/matching
 */
export type ResolvedChunk = {
  mods: KeyCode[];
  keys: KeyCode[];
};

/**
 * Resolved sequence structure
 */
export type ResolvedSequence = readonly ResolvedChunk[];

/**
 * Helper function to create a keybinding chunk
 * @param mods - Modifier bitmask (use M enum, combine with |)
 * @param keys - The keys to press in this chunk
 */
export function c(mods: number, ...keys: KeyCode[]): Chunk {
  return [mods, ...keys];
}

/**
 * Helper function to create a keybinding sequence
 * @param chunks - Array of chunks that form the sequence
 */
export function seq(...chunks: Chunk[]): Sequence {
  return chunks;
}

/**
 * Helper function to create a keybinding with a single chunk
 * Convenience function for common case: single key with optional modifiers
 * @param key - The main key
 * @param mods - Modifier bitmask (use M enum, combine with |)
 */
export function kb(key: KeyCode, mods: number = 0): Sequence {
  return [[mods, key]];
}

/**
 * Helper function to create platform-specific keybindings
 */
export function platformKb(config: {
  mac?: Keybinding;
  windows?: Keybinding;
  linux?: Keybinding;
}): Keybindings {
  return config;
}

/**
 * Resolve modifier bitmask to KeyCode array based on platform
 * Handles CtrlCmd resolution (Meta on mac, Ctrl on win/linux)
 * @param mods - Modifier bitmask
 * @param platform - Target platform
 * @returns Array of KeyCode values for modifiers in stable order
 */
export function resolveMods(
  mods: number,
  platform: "mac" | "windows" | "linux"
): KeyCode[] {
  const result: KeyCode[] = [];

  // Handle CtrlCmd first (resolves to Meta on mac, Ctrl on win/linux)
  if (mods & M.CtrlCmd) {
    if (platform === "mac") {
      result.push(KeyCode.Meta);
    } else {
      result.push(KeyCode.Ctrl);
    }
  }

  // Handle explicit Ctrl (only if CtrlCmd is not set)
  if (mods & M.Ctrl && !(mods & M.CtrlCmd)) {
    result.push(KeyCode.Ctrl);
  }

  // Handle Shift
  if (mods & M.Shift) {
    result.push(KeyCode.Shift);
  }

  // Handle Alt
  if (mods & M.Alt) {
    result.push(KeyCode.Alt);
  }

  // Handle explicit Meta (only if CtrlCmd is not set)
  if (mods & M.Meta && !(mods & M.CtrlCmd)) {
    result.push(KeyCode.Meta);
  }

  return result;
}

/**
 * Resolve a chunk to a ResolvedChunk based on platform
 * @param chunk - The chunk to resolve
 * @param platform - Target platform
 * @returns Resolved chunk with platform-specific modifiers
 */
export function resolveChunk(
  chunk: Chunk,
  platform: "mac" | "windows" | "linux"
): ResolvedChunk {
  const [mods, ...keys] = chunk;
  return {
    mods: resolveMods(mods, platform),
    keys: keys.filter(
      (kc) => kc !== KeyCode.Unknown && kc !== KeyCode.DependsOnKbLayout
    ),
  };
}

/**
 * Resolve a sequence to a ResolvedSequence based on platform
 * @param sequence - The sequence to resolve
 * @param platform - Target platform
 * @returns Resolved sequence with platform-specific modifiers
 */
export function resolveSequence(
  sequence: Sequence,
  platform: "mac" | "windows" | "linux"
): ResolvedSequence {
  return sequence.map((chunk) => resolveChunk(chunk, platform));
}

function isApplePlatform(): boolean {
  const platform = typeof navigator === "object" ? navigator.platform : "";
  return /Mac|iPod|iPhone|iPad/.test(platform);
}

/**
 * Detect the current keyboard OS
 * this is not reliable for general platform/os detection, but good enough for keyboard OS detection
 *
 * mostly to determine cmdctrl key (and for cases that keybindings are fundamentally different, e.g. ctrl+c being color picker on mac, but copy on windows/linux)
 */
export function getKeyboardOS(): "mac" | "windows" | "linux" {
  // SSR / non-browser safety: `navigator` is not defined in Node.js environments.
  // Pick a reasonable default for headless contexts.
  if (typeof navigator === "undefined" || !navigator.platform) {
    return "linux";
  }
  if (isApplePlatform()) return "mac";
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) return "windows";
  return "linux";
}

/**
 * Convert Keybindings to an array of ResolvedSequence
 * Each element represents an alias (alternative keybinding)
 * @param keybindings - The keybindings to convert
 * @param platform - Optional platform to resolve platform-specific keybindings
 * @returns Array of ResolvedSequence, where each element is an alias
 */
export function keybindingsToKeyCodes(
  keybindings: Keybindings,
  platform?: "mac" | "windows" | "linux"
): ResolvedSequence[] {
  const targetPlatform = platform || getKeyboardOS();
  const result: ResolvedSequence[] = [];

  // If it's a platform-specific object
  if (
    typeof keybindings === "object" &&
    !Array.isArray(keybindings) &&
    ("mac" in keybindings || "windows" in keybindings || "linux" in keybindings)
  ) {
    const platformBinding =
      keybindings[targetPlatform] ||
      keybindings.mac ||
      keybindings.linux ||
      keybindings.windows;
    if (platformBinding) {
      return keybindingsToKeyCodes(platformBinding, targetPlatform);
    }
    return [];
  }

  // If it's an array of sequences (aliases)
  if (Array.isArray(keybindings) && keybindings.length > 0) {
    // Check if first element is a chunk (tuple with number as first element) or a sequence (array of chunks)
    const first = keybindings[0];
    if (
      Array.isArray(first) &&
      first.length > 0 &&
      typeof first[0] === "number"
    ) {
      // This is a single sequence (array of chunks)
      result.push(resolveSequence(keybindings as Sequence, targetPlatform));
    } else if (Array.isArray(first) && Array.isArray(first[0])) {
      // This is an array of sequences (aliases)
      for (const seq of keybindings as Sequence[]) {
        result.push(resolveSequence(seq, targetPlatform));
      }
    }
    return result;
  }

  // Single sequence (shouldn't happen with new API, but handle for safety)
  if (Array.isArray(keybindings)) {
    result.push(resolveSequence(keybindings as Sequence, targetPlatform));
    return result;
  }

  return [];
}

/**
 * Platform-specific key symbols using KeyCode enum as keys
 * macOS uses native symbols, Windows/Linux use text labels or universal symbols
 */
type PlatformKeySymbols = {
  mac: Partial<Record<KeyCode, string>>;
  windows: Partial<Record<KeyCode, string>>;
  linux: Partial<Record<KeyCode, string>>;
};

/**
 * Platform-specific key symbols mapping using KeyCode enum
 */
const keysymbols: PlatformKeySymbols = {
  mac: {
    // Modifiers
    [KeyCode.Meta]: "⌘",
    [KeyCode.Ctrl]: "⌃",
    [KeyCode.Alt]: "⌥",
    [KeyCode.Shift]: "⇧",
    // Special keys
    [KeyCode.Enter]: "↵",
    [KeyCode.Backspace]: "⌫",
    [KeyCode.Escape]: "⎋",
    [KeyCode.Tab]: "⇥",
    [KeyCode.Space]: "␣",
    [KeyCode.Delete]: "⌦",
    // Arrows
    [KeyCode.UpArrow]: "↑",
    [KeyCode.DownArrow]: "↓",
    [KeyCode.LeftArrow]: "←",
    [KeyCode.RightArrow]: "→",
    // Navigation
    [KeyCode.Home]: "↖",
    [KeyCode.End]: "↘",
    [KeyCode.PageUp]: "⇞",
    [KeyCode.PageDown]: "⇟",
  },
  windows: {
    // Modifiers - Windows uses text labels
    [KeyCode.Meta]: "Ctrl", // Windows uses Ctrl where macOS uses Meta
    [KeyCode.Ctrl]: "Ctrl",
    [KeyCode.Alt]: "Alt",
    [KeyCode.Shift]: "Shift", // Windows uses text label, not symbol
    // Special keys - Windows uses text labels
    [KeyCode.Enter]: "Enter",
    [KeyCode.Backspace]: "Backspace",
    [KeyCode.Escape]: "Esc",
    [KeyCode.Tab]: "Tab",
    [KeyCode.Space]: "Space",
    [KeyCode.Delete]: "Delete",
    // Arrows - universal symbols
    [KeyCode.UpArrow]: "↑",
    [KeyCode.DownArrow]: "↓",
    [KeyCode.LeftArrow]: "←",
    [KeyCode.RightArrow]: "→",
    // Navigation
    [KeyCode.Home]: "Home",
    [KeyCode.End]: "End",
    [KeyCode.PageUp]: "Page Up",
    [KeyCode.PageDown]: "Page Down",
  },
  linux: {
    // Modifiers - Linux uses text labels (same as Windows)
    [KeyCode.Meta]: "Ctrl", // Linux uses Ctrl where macOS uses Meta
    [KeyCode.Ctrl]: "Ctrl",
    [KeyCode.Alt]: "Alt",
    [KeyCode.Shift]: "Shift", // Linux uses text label, not symbol
    // Special keys - Linux uses text labels
    [KeyCode.Enter]: "Enter",
    [KeyCode.Backspace]: "Backspace",
    [KeyCode.Escape]: "Esc",
    [KeyCode.Tab]: "Tab",
    [KeyCode.Space]: "Space",
    [KeyCode.Delete]: "Delete",
    // Arrows - universal symbols
    [KeyCode.UpArrow]: "↑",
    [KeyCode.DownArrow]: "↓",
    [KeyCode.LeftArrow]: "←",
    [KeyCode.RightArrow]: "→",
    // Navigation
    [KeyCode.Home]: "Home",
    [KeyCode.End]: "End",
    [KeyCode.PageUp]: "Page Up",
    [KeyCode.PageDown]: "Page Down",
  },
};

/**
 * Get key symbol from KeyCode enum
 * @param keyCode - The KeyCode enum value
 * @param platform - The platform (mac, windows, linux)
 * @returns The symbol/label for the key, or the KeyCode string representation if not found
 */
export function keycodeToPlatformUILabel(
  keyCode: KeyCode,
  platform: "mac" | "windows" | "linux" = "linux"
): string {
  const platformSymbols = keysymbols[platform];
  return platformSymbols[keyCode] || KeyCodeUtils.toString(keyCode);
}

/**
 * Get platform-specific UI label for a modifier or key
 * UI keybinding key - returns the platform-specific label string
 * @param key - Either a modifier bitmask (M enum) or a KeyCode
 * @param platform - Optional platform, defaults to current keyboard OS
 * @returns Platform-specific label string (e.g., "⌘" on mac, "Ctrl" on windows/linux)
 *
 * @example
 * uikbdk(M.CtrlCmd) // "⌘" on mac, "Ctrl" on windows/linux
 * uikbdk(KeyCode.KeyI) // "I"
 */
export function uikbdk(
  key: M | KeyCode,
  platform?: "mac" | "windows" | "linux"
): string {
  const targetPlatform = platform || getKeyboardOS();

  // Only treat *single* modifier constants as modifiers.
  // Do NOT try to infer modifiers from bit overlap, as some KeyCode values can overlap by chance.
  if (
    key === M.Ctrl ||
    key === M.Shift ||
    key === M.Alt ||
    key === M.Meta ||
    key === M.CtrlCmd
  ) {
    const resolvedMods = resolveMods(key, targetPlatform);
    // In practice, single modifiers resolve to a single key (Ctrl/Cmd/Shift/Alt).
    if (resolvedMods.length > 0) {
      return keycodeToPlatformUILabel(resolvedMods[0], targetPlatform);
    }
  }

  // It's a KeyCode
  return keycodeToPlatformUILabel(key as KeyCode, targetPlatform);
}
