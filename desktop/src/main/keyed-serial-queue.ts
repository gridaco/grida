/** Serializes work on the same key. Other keys proceed independently. */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<void>>();

  has(key: string): boolean {
    return this.tails.has(key);
  }

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.tails.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
