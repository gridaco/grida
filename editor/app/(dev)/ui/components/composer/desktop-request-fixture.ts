/** Holds a fixture bridge request until the example supplies its outcome. */
export class DesktopRequestFixture {
  private listeners = new Set<() => void>();
  private view = { hold: false, pending: false };
  private settlement?: { resolve(): void; reject(reason: Error): void };

  read = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  hold = (hold: boolean): void => this.update({ hold });

  wait(): Promise<void> {
    if (!this.view.hold) return Promise.resolve();
    if (this.settlement)
      return Promise.reject(new Error("Fixture request already pending"));
    const promise = new Promise<void>((resolve, reject) => {
      this.settlement = { resolve, reject };
    });
    this.update({ pending: true });
    return promise;
  }

  accept = (): void => {
    const pending = this.settlement;
    this.settlement = undefined;
    this.update({ pending: false });
    pending?.resolve();
  };
  refuse = (): void => {
    const pending = this.settlement;
    this.settlement = undefined;
    this.update({ pending: false });
    pending?.reject(new Error("Fixture request refused"));
  };
  reset(): void {
    this.refuse();
    this.update({ hold: false });
  }

  private update(patch: Partial<typeof this.view>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
