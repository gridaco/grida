// GRIDA-SEC-014 — explicit shared provider mutation, never account login or key echo.
import { ProviderCredentialStore } from "@grida/auth/providers";
import { Readable } from "node:stream";
import { Cli } from "../cli";
import { Output } from "../output";
import { ProviderCredentials } from "../provider-credentials";
import { ProviderPrompt } from "../provider-prompt";
import { ProviderStore } from "../provider-store";

export namespace ProviderCommands {
  export type Host = {
    env: NodeJS.ProcessEnv;
    stdin: Readable;
    openStore: typeof ProviderStore.open;
    prompt: (signal: AbortSignal) => Promise<Uint8Array>;
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
    }
  ): Promise<number> {
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    let credentials: ProviderCredentials | undefined;
    let prompted: Uint8Array | undefined;
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
        },
        [
          configured
            ? `${invocation.provider}: saved to shared plaintext credentials.toml with private permissions.`
            : `${invocation.provider}: removed from shared credentials.toml. The provider key has not been revoked.`,
          "Desktop and CLI share stored keys. Environment overrides remain effective; Grida login is separate.",
        ]
      );
      return 0;
    } catch (error) {
      if (error instanceof ProviderCredentialStore.Failure)
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
