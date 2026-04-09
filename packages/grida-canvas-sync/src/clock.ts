/**
 * @module clock
 *
 * Monotonic clock utilities for the sync protocol.
 * The server maintains a single monotonic clock per document/room.
 * Clients track the last-seen server clock for reconnection.
 */

/**
 * A monotonic document clock. Each committed change increments the clock by 1.
 * Used by the server to order changes and by clients to request deltas on reconnect.
 */
export class DocumentClock {
  private _value: number;

  constructor(initial: number = 0) {
    this._value = DocumentClock._validate(initial);
  }

  /** Current clock value. */
  get value(): number {
    return this._value;
  }

  /** Increment and return the new value. */
  tick(): number {
    return ++this._value;
  }

  /** Reset to a specific value (used when loading from storage). */
  reset(value: number): void {
    this._value = DocumentClock._validate(value);
  }

  private static _validate(v: number): number {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new RangeError(
        `DocumentClock value must be a non-negative safe integer, got ${v}`
      );
    }
    return v;
  }
}
