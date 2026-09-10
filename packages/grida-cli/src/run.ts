// GRIDA-SEC-010 — compose public auth operations; never expose session credentials.
import { AuthClient } from "@grida/auth";
import { AccountClient } from "@grida/account";
import { AuthCommands } from "./commands/auth";
import { AccountCommands } from "./commands/account";
import { CliHost } from "./host";
import { Output } from "./output";
import type { Cli } from "./cli";

/** Command dispatch owns presentation and process lifetime, not account policy. */
export async function run(
  invocation: Exclude<
    Cli.Invocation,
    | Cli.MediaInvocation
    | Cli.ProviderInvocation
    | { command: "help" | "version" | "docs" }
  >,
  output: Output
): Promise<number> {
  let runtime: AuthCommands.Runtime | undefined;
  let interrupted = false;
  let cancellation: Promise<void> | undefined;
  const interrupt = () => {
    interrupted = true;
    if (runtime && invocation.command === "auth login") {
      cancellation ??= runtime.client.cancelLogin().catch(() => undefined);
    }
    // Other operations may hold the cross-process custody lock around a native
    // write. Let them settle; a signal must not release it ahead of that write.
  };
  const complete = async <T>(operation: Promise<T>): Promise<T> => {
    const value = await operation;
    await cancellation;
    if (interrupted) throw new AuthClient.Failure("cancelled");
    return value;
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    runtime = await CliHost.open(
      invocation.command === "auth login"
        ? {
            storage: invocation.storage,
            noBrowser: invocation.noBrowser,
            ...(invocation.noBrowser
              ? {
                  onAuthorizationUrl: (url: string) => {
                    process.stderr.write(
                      `Open this URL in your browser:\n${url}\n`
                    );
                  },
                }
              : {}),
          }
        : {}
    );
    if (interrupted) throw new AuthClient.Failure("cancelled");
    switch (invocation.command) {
      case "auth login":
      case "auth status": {
        const value = await complete(
          invocation.command === "auth login"
            ? AuthCommands.login(runtime)
            : AuthCommands.status(runtime)
        );
        output.result(
          value,
          value.state === "signed-out"
            ? ["Signed out. Run grida auth login."]
            : [
                `${value.state === "refresh-needed" ? "Refresh needed" : "Signed in"}: ${value.identity.email ?? value.identity.id}`,
                `Account: ${value.identity.id}`,
                `Access expires: ${new Date(value.expiresAt).toISOString()}`,
              ]
        );
        return value.state === "signed-out" ? 1 : 0;
      }
      case "auth logout": {
        const value = await complete(AuthCommands.logout(runtime));
        output.result(value, [
          "Signed out locally.",
          `Remote revocation: ${value.revocation}.`,
        ]);
        return value.revocation === "unconfirmed" ? 1 : 0;
      }
      case "auth storage show":
      case "auth storage migrate": {
        const value = await complete(
          invocation.command === "auth storage migrate"
            ? AuthCommands.storageMigrate(runtime, invocation.backend)
            : AuthCommands.storageShow(runtime)
        );
        output.result(value, [
          `Storage: ${value.backend}`,
          `Profile: ${value.profile}`,
          `Initialized: ${value.initialized}`,
          `Migration: ${value.migration ?? "none"}`,
        ]);
        return 0;
      }
      case "account view": {
        const value = await complete(AccountCommands.view(runtime.client));
        output.result(value, [
          `Account: ${value.identity.email ?? value.identity.id}`,
          `ID: ${value.identity.id}`,
          `Name: ${value.identity.display_name ?? "—"}`,
          "Organizations:",
          ...value.organizations.map(
            (org) => `  ${org.name} (ID ${org.id}) — ${org.display_name}`
          ),
          ...(value.organizations.length ? [] : ["  None"]),
        ]);
        return 0;
      }
      case "account credits": {
        const value = await complete(
          AccountCommands.credits(runtime.client, invocation.selector)
        );
        output.result(value, [
          `Organization: ${value.organization.name} (ID ${value.organization.id})`,
          `Billing account: ${value.account_present ? "present" : "absent"}`,
          `Credits: ${value.balance_cents === null ? "unknown" : Output.usd(value.balance_cents)} (${value.state})`,
          `Cache updated: ${value.cache_updated_at ?? "unknown"}`,
          `Cached eligibility: ${value.billing_gate.allowed ? "allowed" : value.billing_gate.reason}`,
          "Cached estimate; generation checks current access separately.",
        ]);
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof CliHost.Failure) {
      output.failure({ code: error.code, message: error.message });
    } else if (error instanceof AuthClient.Failure) {
      const hint =
        error.code === "signed_out" || error.code === "token_rejected"
          ? " Run grida auth login."
          : error.code === "custody_failed"
            ? " Check auth storage show and OS keyring access; file storage requires an explicit choice."
            : "";
      output.failure({
        code: error.code,
        message:
          error.code === "cancelled"
            ? "Command interrupted. An in-flight operation may have completed; inspect the session or storage state before retrying."
            : "Grida authentication or account access failed." + hint,
      });
    } else if (error instanceof AccountClient.Failure) {
      output.failure({
        code: error.code,
        message:
          error.code === "organization_required"
            ? "Select an organization with --org <slug> or --org-id <id>."
            : "Grida could not complete the organization read.",
        choices: error.choices,
        choices_truncated: error.choices_truncated,
      });
    } else {
      // Never serialize arbitrary errors, native messages, server bodies or causes.
      output.failure({
        code: "unavailable",
        message: "Grida could not complete this command.",
      });
    }
    return 1;
  } finally {
    await cancellation;
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
