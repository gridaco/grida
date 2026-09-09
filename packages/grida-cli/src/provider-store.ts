// GRIDA-SEC-014 — native provider home only; no project or account configuration.
import { ProviderCredentialStore } from "@grida/auth/providers";
import { home } from "@grida/home";
import { realpath } from "node:fs/promises";
import path from "node:path";

export namespace ProviderStore {
  /** Resolve only the supplied native home, including OS aliases such as /var. */
  export async function open(
    env: NodeJS.ProcessEnv
  ): Promise<ProviderCredentialStore> {
    try {
      const selected = home.dir({ env });
      let parent = selected;
      const suffix: string[] = [];
      for (;;) {
        try {
          const canonical = path.join(await realpath(parent), ...suffix);
          return new ProviderCredentialStore({ home: canonical });
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
          const next = path.dirname(parent);
          if (next === parent) throw error;
          suffix.unshift(path.basename(parent));
          parent = next;
        }
      }
    } catch (error) {
      if (error instanceof ProviderCredentialStore.Failure) throw error;
      throw new ProviderCredentialStore.Failure("storage_failed");
    }
  }

  /** Fixed guidance, never a native exception or credential file excerpt. */
  export function message(code: ProviderCredentialStore.FailureCode): string {
    switch (code) {
      case "unsupported_platform":
        return "Stored provider credentials require a macOS or Linux Node main thread. Use an explicit environment key or --key-stdin for this invocation.";
      case "migration_pending":
      case "migration_failed":
        return "Desktop provider-key migration needs cleanup. Open the updated Desktop and retry a provider connection, or use an explicit environment key or --key-stdin.";
      case "store_busy":
        return "Provider credentials are busy in another process. Retry after it finishes.";
      case "invalid_store":
        return "credentials.toml is not a valid Grida provider credential file. Check its TOML syntax and required fields; run grida providers --help for the format. No alternate stored key was selected.";
      case "unsupported_version":
        return "credentials.toml uses an unsupported format version. Update Grida to a compatible version; do not change the version field to bypass this check.";
      case "invalid_input":
        return "Invalid provider credential input or storage location. Check the provider name and use an absolute GRIDA_HOME if set.";
      default:
        return "Cannot access or lock provider credential storage. Check filesystem or sandbox access, ownership and private permissions for the Grida home; run grida providers --help for its location. No alternate stored key was selected.";
    }
  }
}
