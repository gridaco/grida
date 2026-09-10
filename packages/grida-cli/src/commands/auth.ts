import type { createPersistentNativeAuth } from "@grida/auth/node";

/** Command adaptation only; the auth producer owns sessions and storage. */
export namespace AuthCommands {
  export type Runtime = Awaited<ReturnType<typeof createPersistentNativeAuth>>;

  export function login(runtime: Runtime) {
    return runtime.client.login();
  }

  export function status(runtime: Runtime) {
    return runtime.client.status();
  }

  export function logout(runtime: Runtime) {
    return runtime.client.logout();
  }

  export function storageShow(runtime: Runtime) {
    return runtime.storage.info();
  }

  export function storageMigrate(
    runtime: Runtime,
    backend: "keyring" | "file"
  ) {
    return runtime.storage.migrate(backend);
  }
}
