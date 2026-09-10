// GRIDA-SEC-013 / GRIDA-SEC-014 — check before shared custody; no account login or key echo.
import { ProviderCredentialStore } from "@grida/auth/providers";
import { ProviderHttp, type ProviderHttpTransport } from "@grida/ai";
import { ProviderCredentials as ProviderCredentialPolicy } from "@grida/ai/providers";
import { Readable } from "node:stream";
import { Cli } from "../cli";
import { Output } from "../output";
import { ProviderCredentials } from "../provider-credentials";
import { ProviderPrompt } from "../provider-prompt";
import { ProviderStore } from "../provider-store";
import { MediaHttp } from "../media-http";

export namespace ProviderCommands {
  export type Host = {
    env: NodeJS.ProcessEnv;
    stdin: Readable;
    openStore: typeof ProviderStore.open;
    prompt: (signal: AbortSignal) => Promise<Uint8Array>;
    transport: () => ProviderHttpTransport;
  };

  export async function run(
    invocation: Cli.ProviderInvocation,
    output: Output,
    host: Host = {
      env: process.env,
      stdin: process.stdin,
      openStore: ProviderStore.open,
      prompt: (signal) =>
        ProviderPrompt.read(process.stdin, process.stderr, signal),
      transport: () => new MediaHttp().transport,
    }
  ): Promise<number> {
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    let credentials: ProviderCredentials | undefined;
    let prompted: Uint8Array | undefined;
    let verification: ProviderCredentialPolicy.CheckResult | undefined;
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    try {
      if (invocation.command === "providers configure") {
        if (!invocation.keyStdin && (invocation.json || invocation.noInput))
          throw new Cli.Failure(
            "interaction_required",
            "Use --key-stdin for noninteractive provider configuration."
          );
        if (!invocation.keyStdin)
          prompted = await host.prompt(controller.signal);
        credentials = await ProviderCredentials.open({
          env: {},
          provider: invocation.provider,
          stdin: {
            provider: invocation.provider,
            input: invocation.keyStdin
              ? host.stdin
              : Readable.from([prompted!]),
          },
          signal: controller.signal,
        });
        // Only explicit registration probes. Reads and generation use static
        // admission alone; verification is transient and never stored in TOML.
        verification = await new ProviderCredentialPolicy({
          http: new ProviderHttp(host.transport()),
        }).check({
          provider: invocation.provider,
          key: credentials.get(invocation.provider)!,
          signal: controller.signal,
        });
      }
      if (controller.signal.aborted)
        throw new ProviderCredentials.Failure("cancelled");
      const store = await host.openStore(host.env);
      if (controller.signal.aborted)
        throw new ProviderCredentials.Failure("cancelled");
      // Once started, allow the coordinated durable mutation to settle on signals.
      if (invocation.command === "providers configure")
        await store.set(
          invocation.provider,
          credentials!.get(invocation.provider)!
        );
      else await store.remove(invocation.provider);
      const configured = invocation.command === "providers configure";
      output.result(
        {
          provider: invocation.provider,
          stored: configured,
          storage: "plaintext_file",
          shared: true,
          environment_checked: false,
          ...(verification ? { verification } : {}),
        },
        [
          configured
            ? `${invocation.provider}: saved to shared plaintext credentials.toml with private permissions.`
            : `${invocation.provider}: removed from shared credentials.toml. The provider key has not been revoked.`,
          "Desktop and CLI share stored keys. Environment overrides remain effective; Grida login is separate.",
          ...(verification
            ? [
                verification.status === "accepted"
                  ? "Provider accepted the key check. Model access and available credits remain unverified."
                  : "No suitable provider key check is available; saved with static validation only.",
              ]
            : []),
        ]
      );
      return 0;
    } catch (error) {
      if (error instanceof ProviderCredentialPolicy.Failure)
        output.failure({ code: error.code, message: checkMessage(error.code) });
      else if (error instanceof ProviderCredentialStore.Failure)
        output.failure({
          code: error.code,
          message: ProviderStore.message(error.code),
        });
      else if (
        error instanceof ProviderCredentials.Failure ||
        error instanceof Cli.Failure
      )
        output.failure({ code: error.code, message: error.message });
      else
        output.failure({
          code: "credentials_unavailable",
          message:
            "Provider credentials could not be updated. Inspect provider status before retrying.",
        });
      return error instanceof Cli.Failure && error.code === "invalid_usage"
        ? 2
        : 1;
    } finally {
      prompted?.fill(0);
      credentials?.dispose();
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
}

function checkMessage(code: ProviderCredentialPolicy.FailureCode): string {
  switch (code) {
    case "invalid_input":
      return "The provider key has an invalid format. Stored credentials were not changed.";
    case "credential_rejected":
      return "The provider rejected this key for inference use. Stored credentials were not changed.";
    case "access_denied":
      return "The provider denied the key check. Check key permissions or account restrictions; stored credentials were not changed.";
    case "aborted":
      return "Provider configuration cancelled before saving.";
    case "timeout":
      return "The provider key check timed out. Stored credentials were not changed; retry configuration when ready.";
    default:
      return "The provider key check could not be completed. Stored credentials were not changed; retry configuration when ready.";
  }
}
