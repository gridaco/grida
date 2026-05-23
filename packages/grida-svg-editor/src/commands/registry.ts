/**
 * Command registry.
 *
 * A passive id-keyed registry of handlers. Built so that:
 *
 *  - keybindings (in `src/keymap`) can address commands by stable id;
 *  - new commands can be added in ONE place (`src/commands/defaults.ts`)
 *    without growing the public surface of the editor;
 *  - "one key, many meanings" can be expressed via chain semantics: a
 *    handler returns `true` if it consumed, `false`/`void` otherwise,
 *    and the dispatcher tries the next candidate in the chain.
 *
 * Handlers are plain closures — they capture whatever editor reference
 * they need. The registry itself stays unaware of the editor's type,
 * which avoids a circular type dependency between editor and registry.
 */

/** Stable, dotted id for a command, e.g. `"history.undo"`. */
export type CommandId = string;

/**
 * A command handler.
 *
 * Return `true` if the handler consumed the invocation. Return `false`
 * or `undefined` to signal "did not apply" — the dispatcher will try
 * the next candidate registered for the same key.
 *
 * Handlers are closures: they capture their editor reference. No
 * editor parameter is passed — keep handlers self-contained.
 */
export type CommandHandler = (args?: unknown) => boolean | void;

export class CommandRegistry {
  private readonly map = new Map<CommandId, CommandHandler>();

  /**
   * Register a command. Returns an unregister function. Re-registering
   * the same id replaces the previous handler (last writer wins).
   */
  register(id: CommandId, handler: CommandHandler): () => void {
    this.map.set(id, handler);
    return () => {
      // Only delete if this exact handler is still in place — otherwise a
      // later `register(id, ...)` would be silently unregistered by our
      // returned cleanup.
      if (this.map.get(id) === handler) {
        this.map.delete(id);
      }
    };
  }

  /**
   * Invoke a command by id. Returns `true` if the handler consumed,
   * `false` otherwise (including unknown ids and handlers that returned
   * `false`/`undefined`).
   */
  invoke(id: CommandId, args?: unknown): boolean {
    const handler = this.map.get(id);
    if (!handler) return false;
    return handler(args) === true;
  }

  has(id: CommandId): boolean {
    return this.map.has(id);
  }

  /** All registered ids, for debugging / introspection. */
  ids(): readonly CommandId[] {
    return Array.from(this.map.keys());
  }
}
