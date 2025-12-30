import { keycodeToPlatformUILabel } from "@/grida-canvas/keybinding";
import {
  keybindingsToKeyCodes,
  getKeyboardOS,
  type ResolvedSequence,
} from "@/grida-canvas/keybinding";
import { actions, type UXHostActionId } from "./uxhost-actions";

/**
 * Get the resolved sequences for an action ID
 */
function getResolvedSequences(
  actionId: UXHostActionId,
  platform?: "mac" | "windows" | "linux"
): ResolvedSequence[] {
  const action = actions[actionId];
  if (!action) {
    return [];
  }

  const targetPlatform = platform || getKeyboardOS();
  return keybindingsToKeyCodes(action.keybindings, targetPlatform);
}

/**
 * Convert a resolved sequence to a string representation
 * Used for toast messages, context menus, etc.
 */
function sequenceToString(
  sequence: ResolvedSequence,
  platform: "mac" | "windows" | "linux"
): string {
  return sequence
    .map((chunk) => {
      const parts: string[] = [];
      // Add modifiers
      chunk.mods.forEach((mod) => {
        parts.push(keycodeToPlatformUILabel(mod, platform));
      });
      // Add keys
      chunk.keys.forEach((key) => {
        parts.push(keycodeToPlatformUILabel(key, platform));
      });
      return parts.join("");
    })
    .join(" ");
}

/**
 * Get the first keybinding as a string for an action
 * Returns empty string if not found
 *
 * @throws {Error} If actionId is not a valid action ID
 */
export function keyboardShortcutText(
  actionId: UXHostActionId,
  platform?: "mac" | "windows" | "linux"
): string {
  const sequences = getResolvedSequences(actionId, platform);
  if (sequences.length === 0) {
    return "";
  }

  const targetPlatform = platform || getKeyboardOS();
  return sequenceToString(sequences[0], targetPlatform);
}

/**
 * Get all keybinding aliases as strings for an action
 * Returns empty array if not found
 */
export function keyboardShortcutTextAll(
  actionId: UXHostActionId,
  platform?: "mac" | "windows" | "linux"
): string[] {
  const sequences = getResolvedSequences(actionId, platform);
  const targetPlatform = platform || getKeyboardOS();

  return sequences.map((seq) => sequenceToString(seq, targetPlatform));
}

/**
 * Get keyboard shortcut as a formatted string with separators between chunks
 * Useful for display in tooltips or settings
 */
export function keyboardShortcutTextFormatted(
  actionId: UXHostActionId,
  platform?: "mac" | "windows" | "linux",
  separator: string = " "
): string {
  const sequences = getResolvedSequences(actionId, platform);
  if (sequences.length === 0) {
    return "";
  }

  const targetPlatform = platform || getKeyboardOS();
  const sequence = sequences[0];

  return sequence
    .map((chunk) => {
      const parts: string[] = [];
      chunk.mods.forEach((mod) => {
        parts.push(keycodeToPlatformUILabel(mod, targetPlatform));
      });
      chunk.keys.forEach((key) => {
        parts.push(keycodeToPlatformUILabel(key, targetPlatform));
      });
      return parts.join("");
    })
    .join(separator);
}
