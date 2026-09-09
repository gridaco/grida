// GRIDA-SEC-010 — explicit OS credential custody; native failures never select another store.
import { AuthClient } from "./auth-client";

/** Internal native seam. Profile binding, revisions, and locking belong to custody. */
export class Keyring {
  private binding?: Promise<Keyring.Bindings>;

  // Import only on first use: explicit file custody needs no working native addon.
  constructor(
    private readonly load: Keyring.Loader = () => import("@github/keytar")
  ) {}

  async read(service: string, account: string): Promise<string | null> {
    try {
      validateString(service);
      validateString(account);
      const binding = await this.bindings();
      const value = await binding.getPassword(service, account);
      // Preserve native null, never parse error messages as absence. On Linux,
      // libsecret can return null after a dismissed unlock prompt too; custody
      // must reject null for an initialized profile, including after logout.
      if (value === null || typeof value === "string") return value;
      throw new AuthClient.Failure("custody_failed");
    } catch {
      throw new AuthClient.Failure("custody_failed");
    }
  }

  async write(service: string, account: string, value: string): Promise<void> {
    try {
      validateString(service);
      validateString(account);
      validateString(value);
      const binding = await this.bindings();
      // Await native completion. A timeout cannot cancel a pending native write
      // and would let it escape the caller's cross-process custody lock.
      await binding.setPassword(service, account, value);
      // The Linux binding checks GError but discards the store's boolean result.
      // Verify every write while still under the caller's custody lock.
      if ((await binding.getPassword(service, account)) !== value) {
        throw new AuthClient.Failure("custody_failed");
      }
    } catch {
      throw new AuthClient.Failure("custody_failed");
    }
  }

  private bindings(): Promise<Keyring.Bindings> {
    return (this.binding ??= Promise.resolve()
      .then(() => this.load())
      .then((module) => {
        // Dynamic import of the CJS package exposes its API under default.
        const binding =
          typeof module === "object" && module !== null && "default" in module
            ? module.default
            : module;
        if (
          typeof binding !== "object" ||
          binding === null ||
          !("getPassword" in binding) ||
          typeof binding.getPassword !== "function" ||
          !("setPassword" in binding) ||
          typeof binding.setPassword !== "function"
        ) {
          throw new AuthClient.Failure("custody_failed");
        }
        return binding as Keyring.Bindings;
      })
      .catch(() => {
        // Never retain native error messages or causes, which may contain values.
        throw new AuthClient.Failure("custody_failed");
      }));
  }
}

export namespace Keyring {
  /** Private test seam matching the pinned native package's asynchronous API. */
  export interface Bindings {
    getPassword(service: string, account: string): Promise<string | null>;
    setPassword(service: string, account: string, value: string): Promise<void>;
  }
  export type Loader = () => Promise<unknown>;
}

function validateString(value: string): void {
  // The Linux backend uses NUL-terminated strings. Refuse truncation/aliasing;
  // custody writes nonempty JSON records, including secret-free tombstones.
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new AuthClient.Failure("custody_failed");
  }
}
