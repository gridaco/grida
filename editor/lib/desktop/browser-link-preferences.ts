/** Shared by Desktop renderer windows on the same origin. */
export namespace BrowserLinkPreferences {
  export type Destination = "grida" | "system";
  export type Kind = "web" | "local";
  export type Snapshot = Readonly<Record<Kind, Destination>>;

  // Independent keys let two windows save different preferences concurrently.
  const keys = {
    web: "grida.desktop.browser.openWebIn",
    local: "grida.desktop.browser.openLocalIn",
  } as const;
  const changed = "grida:browser-link-preferences";
  export const defaults: Snapshot = Object.freeze({
    web: "system",
    local: "grida",
  });
  let snapshot = defaults;

  function readDestination(storage: Storage, kind: Kind): Destination {
    const value = storage.getItem(keys[kind]);
    return value === "grida" || value === "system" ? value : defaults[kind];
  }

  /** Read the latest saved choice, including changes from another window. */
  export function read(): Snapshot {
    if (typeof window === "undefined") return defaults;
    try {
      const storage = window.localStorage;
      const web = readDestination(storage, "web");
      const local = readDestination(storage, "local");
      if (snapshot.web !== web || snapshot.local !== local) {
        snapshot = Object.freeze({ web, local });
      }
      return snapshot;
    } catch {
      return defaults;
    }
  }

  export function set(kind: Kind, destination: Destination): void {
    window.localStorage.setItem(keys[kind], destination);
    window.dispatchEvent(new Event(changed));
  }

  export function subscribe(listener: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const target = window;
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === keys.web ||
        event.key === keys.local
      )
        listener();
    };
    target.addEventListener("storage", onStorage);
    target.addEventListener(changed, listener);
    return () => {
      target.removeEventListener("storage", onStorage);
      target.removeEventListener(changed, listener);
    };
  }
}
