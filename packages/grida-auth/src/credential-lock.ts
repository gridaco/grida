// GRIDA-SEC-014 — native credential writers share crash-released private exclusion.
import path from "node:path";
import { isMainThread } from "node:worker_threads";
import { AuthClient } from "./auth-client";
import { ProfileLock } from "./profile-lock";

/** Native credential-file writer exclusion. It neither reads nor writes credentials. */
export class CredentialLock {
  private readonly lock: ProfileLock;

  constructor(options: { directory: string }) {
    try {
      const directory = options.directory;
      if (
        typeof directory !== "string" ||
        !path.isAbsolute(directory) ||
        path.resolve(directory) !== directory ||
        directory === path.parse(directory).root ||
        // eslint-disable-next-line no-control-regex -- Private paths exclude controls.
        /[\x00-\x1f\x7f]/.test(directory) ||
        !directory.isWellFormed()
      )
        throw new CredentialLock.Failure("invalid_input");
      this.lock = new ProfileLock(directory);
    } catch {
      throw new CredentialLock.Failure("invalid_input");
    }
  }

  /** 30-second acquisition deadline; never steals a held lock or rolls back host writes. */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (
      !["darwin", "linux"].includes(process.platform) ||
      !isMainThread ||
      !process.geteuid
    )
      throw new CredentialLock.Failure("unsupported_platform");
    if (typeof operation !== "function")
      throw new CredentialLock.Failure("invalid_input");
    let callbackFailed = false;
    let callbackError: unknown;
    try {
      return await this.lock.run(async () => {
        try {
          return await operation();
        } catch (error) {
          callbackFailed = true;
          callbackError = error;
          throw error;
        }
      });
    } catch (error) {
      // The lock does not reinterpret host domain failures or log their content.
      if (callbackFailed && error === callbackError) throw error;
      throw new CredentialLock.Failure(
        error instanceof AuthClient.Failure && error.code === "session_busy"
          ? "busy"
          : "storage_failed"
      );
    }
  }
}

export namespace CredentialLock {
  export type FailureCode =
    | "invalid_input"
    | "unsupported_platform"
    | "busy"
    | "storage_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(`Grida credential lock failed (${code})`);
      this.name = "CredentialLock.Failure";
      this.code = code;
    }
  }
}
