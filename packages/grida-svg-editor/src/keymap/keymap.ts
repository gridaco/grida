/**
 * Keymap — bindings of declarative `Keybinding`s (from `@grida/keybinding`)
 * to command ids.
 *
 * Dispatch is ProseMirror-`chainCommands`-shaped: multiple bindings on
 * the same key are tried in priority order; the first whose handler
 * returns `true` wins, the rest are skipped. This keeps "one key, many
 * meanings" expressible without a `when:` DSL — handlers self-guard on
 * editor state and return `false` when not applicable.
 *
 * The keymap does NOT see modifier-as-signal (e.g. Alt-held for
 * measurement). That stays on the HUD modifiers channel. The keymap
 * only sees Mod+D-shape chords.
 */

import {
  chunkKey,
  eventToChunk,
  getKeyboardOS,
  keybindingsToKeyCodes,
  KeyCode,
  type Keybinding,
  type Platform,
} from "@grida/keybinding";
import type { CommandId, CommandRegistry } from "../commands/registry";
import { is_text_input_focused } from "../util/dom";

export type KeymapBinding = {
  /** Declarative key combination. Build with `kb()` / `c()` / `seq()`. */
  keybinding: Keybinding;
  /** Command id to invoke on match. */
  command: CommandId;
  /** Forwarded as the `args` parameter to the command handler. */
  args?: unknown;
  /** Higher priorities run first in the chain. Default 0. */
  priority?: number;
  /**
   * Reserved for V2; not honored by the V1 dispatcher. When added, this
   * will be evaluated before the handler runs; if false, the binding is
   * skipped without invoking the handler.
   */
  when?: (ctx: unknown) => boolean;
};

/** Modifiers that, when held, allow a binding to fire even inside a text input. */
const TEXT_INPUT_SAFE_MODS = new Set<KeyCode>([
  KeyCode.Meta,
  KeyCode.Ctrl,
  KeyCode.Alt,
]);

export class Keymap {
  /**
   * Bindings bucketed by canonical chunk-key hash, computed per
   * `@grida/keybinding`'s `chunkKey`. Each list is the chain for that
   * key, sorted in dispatch order (priority desc, then registration
   * order).
   */
  private readonly buckets = new Map<
    string,
    Array<{ binding: KeymapBinding; seq: number }>
  >();

  /** Insert order, so ties on priority are deterministic. */
  private seq = 0;

  constructor(
    private readonly commands: CommandRegistry,
    private readonly platformGetter: () => Platform = getKeyboardOS
  ) {}

  /**
   * Bind a key combination to a command. Returns an unbind function.
   * The same `Keybinding` can be bound to multiple commands — they will
   * all be tried in chain order on dispatch.
   */
  bind(binding: KeymapBinding): () => void {
    const seq = ++this.seq;
    const entry = { binding, seq };
    for (const hash of this.chunkKeysFor(binding.keybinding)) {
      const list = this.buckets.get(hash);
      if (list) {
        list.push(entry);
        list.sort(compareEntries);
      } else {
        this.buckets.set(hash, [entry]);
      }
    }
    return () => {
      for (const hash of this.chunkKeysFor(binding.keybinding)) {
        const list = this.buckets.get(hash);
        if (!list) continue;
        const idx = list.findIndex((e) => e === entry);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this.buckets.delete(hash);
      }
    };
  }

  /**
   * Remove bindings matching the spec. If both filters are passed, only
   * bindings that match BOTH are removed.
   */
  unbind(spec: { keybinding?: Keybinding; command?: CommandId }): void {
    const hashFilter = spec.keybinding
      ? new Set(this.chunkKeysFor(spec.keybinding))
      : null;
    for (const [hash, list] of this.buckets) {
      if (hashFilter && !hashFilter.has(hash)) continue;
      const next = list.filter((e) => {
        if (spec.command && e.binding.command !== spec.command) return true;
        return false;
      });
      if (next.length === 0) this.buckets.delete(hash);
      else if (next.length !== list.length) this.buckets.set(hash, next);
    }
  }

  /** All registered bindings, for introspection. Order is not guaranteed. */
  bindings(): readonly KeymapBinding[] {
    const seen = new Set<KeymapBinding>();
    for (const list of this.buckets.values()) {
      for (const e of list) seen.add(e.binding);
    }
    return Array.from(seen);
  }

  /**
   * Does the keymap have a binding that matches this event's chord —
   * regardless of whether any handler would consume it? Hosts use this
   * to decide whether to swallow the platform's default action (e.g.
   * `event.preventDefault()` in the browser), so that an advertised
   * shortcut like `Cmd+G` doesn't fall through to the browser's find
   * bar even when the binding's handler rejects.
   *
   * Pure read; runs no handlers, no side effects. Honors the same
   * text-input-focused guard `dispatch` uses, so a typing user's
   * keystroke isn't "claimed" by an unrelated unmodified key.
   */
  claims(event: KeyboardEvent): boolean {
    const chunk = eventToChunk(event);
    if (chunk.keys.length === 0) return false; // bare modifier press
    const list = this.buckets.get(chunkKey(chunk));
    if (!list || list.length === 0) return false;
    if (is_text_input_focused() && !this.has_safe_mod(chunk.mods)) return false;
    return true;
  }

  /**
   * Match the event against bound chunks, then run candidates in chain
   * order. Returns `true` on the first handler that consumes; returns
   * `false` if nothing matched or all matches fell through.
   *
   * `dispatch` is browser-agnostic: it does NOT call `preventDefault()`
   * or touch the event in any way. The host decides what to do with the
   * platform default — typically `if (keymap.claims(e)) e.preventDefault()`,
   * which prevents the platform default for advertised shortcuts even
   * when the chain rejects. See README → `editor.keymap`.
   */
  dispatch(event: KeyboardEvent): boolean {
    const chunk = eventToChunk(event);
    if (chunk.keys.length === 0) return false; // bare modifier press — skip
    const hash = chunkKey(chunk);
    const list = this.buckets.get(hash);
    if (!list || list.length === 0) return false;

    const text_focused = is_text_input_focused();

    for (const { binding } of list) {
      if (text_focused && !this.has_safe_mod(chunk.mods)) continue;
      if (this.commands.invoke(binding.command, binding.args)) {
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------

  /**
   * Compute the set of canonical hashes a `Keybinding` lights up. A
   * binding with aliases (multiple sequences) contributes one hash per
   * single-chunk alias; multi-chunk sequences (chords) are skipped in
   * V1.
   */
  private chunkKeysFor(binding: Keybinding): string[] {
    const platform = this.platformGetter();
    const sequences = keybindingsToKeyCodes(binding, platform);
    const out: string[] = [];
    for (const seq of sequences) {
      if (seq.length !== 1) continue;
      out.push(chunkKey(seq[0]));
    }
    return out;
  }

  private has_safe_mod(mods: readonly KeyCode[]): boolean {
    for (const m of mods) {
      if (TEXT_INPUT_SAFE_MODS.has(m)) return true;
    }
    return false;
  }
}

function compareEntries(
  a: { binding: KeymapBinding; seq: number },
  b: { binding: KeymapBinding; seq: number }
): number {
  const pa = a.binding.priority ?? 0;
  const pb = b.binding.priority ?? 0;
  if (pa !== pb) return pb - pa; // higher priority first
  return a.seq - b.seq; // earlier registration first
}
