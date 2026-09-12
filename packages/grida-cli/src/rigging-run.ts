// GRIDA-SEC-015 — scoped account handoff and BYOK custody remain independent.
// GRIDA-SEC-013 — explicit mesh operations, funding preflight, safe task and artifact output.
// GRIDA-SEC-006 / GRIDA-GG: provider — scoped organization grants are memory-only.
import {
  GridaGatewaySessionStore,
  ProviderHttp,
  RiggingClient,
  RiggingOperations,
  type ProviderHttpTransport,
} from "@grida/ai";
import { ProviderCredentialStore } from "@grida/auth/providers";
import type { Readable } from "node:stream";
import { AccountClient } from "@grida/account";
import { AuthClient } from "@grida/auth";
import { CliHost } from "./host";
import { Cli } from "./cli";
import { MediaFiles } from "./media-files";
import { MediaHttp } from "./media-http";
import { Output } from "./output";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderStore } from "./provider-store";

/** CLI file/credential/output composition against the public mesh-operation SDK. */
export namespace RiggingCommands {
  export type Host = {
    env: NodeJS.ProcessEnv;
    stdin: Readable;
    openStore: typeof ProviderStore.open;
    openAuth: typeof CliHost.open;
    transport: (ggOrigin?: string) => ProviderHttpTransport;
  };

  export async function run(
    invocation: Cli.RiggingInvocation,
    output: Output,
    host: Host = {
      env: process.env,
      stdin: process.stdin,
      openStore: ProviderStore.open,
      openAuth: CliHost.open,
      transport: (ggOrigin) => new MediaHttp({ ggOrigin }).transport,
    }
  ): Promise<number> {
    const operations = new RiggingOperations();
    const gg = new GridaGatewaySessionStore();
    const controller = new AbortController();
    const signal = controller.signal;
    const interrupt = () => controller.abort();
    const check = () => {
      if (signal.aborted) throw new MediaFiles.Failure("cancelled");
    };
    let credentials: ProviderCredentials | undefined;
    let directory: MediaFiles.Directory | undefined;
    let task: RiggingClient.Task | undefined;
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    try {
      if (invocation.command === "rigging list") {
        const descriptors = operations.list({
          ...(invocation.provider ? { provider: invocation.provider } : {}),
          ...(invocation.feature ? { feature: invocation.feature } : {}),
        });
        output.result(
          descriptors,
          descriptors.map(
            (descriptor) =>
              `${descriptor.feature}  ${descriptor.provider_id}${descriptor.feature === "rigging" ? `  ${descriptor.model_id}` : ""}  ${descriptor.output.representation}`
          )
        );
        return 0;
      }
      const selector: RiggingOperations.Selector =
        invocation.command === "rigging check" ||
        (invocation.command === "rigging inspect" &&
          invocation.feature === "rig-check")
          ? { feature: "rig-check", provider: invocation.provider }
          : {
              feature: "rigging",
              provider: invocation.provider,
              model_id: invocation.model!,
            };
      const descriptor = operations.inspect(selector);
      if (invocation.command === "rigging inspect") {
        output.result(descriptor, [
          `${descriptor.feature} (${descriptor.provider_id})${descriptor.feature === "rigging" ? ` — ${descriptor.model_id}` : ""}`,
          `Output: ${descriptor.output.representation}`,
          "Input schema:",
          ...JSON.stringify(descriptor.input_schema, null, 2).split("\n"),
          ...(descriptor.output.representation === "structured"
            ? [
                "Output schema:",
                ...JSON.stringify(descriptor.output.schema, null, 2).split(
                  "\n"
                ),
              ]
            : []),
        ]);
        return 0;
      }
      const value =
        invocation.input !== undefined
          ? await MediaFiles.readInput(invocation.input, signal, host.stdin)
          : {
              mesh: await encodedMesh(invocation.mesh, signal),
              ...(invocation.command === "rigging run"
                ? { rig_type: invocation.rigType, spec: invocation.spec }
                : {}),
            };
      const parsed = operations.parseInput(selector, value);
      check();
      // The file contract and complete SDK input parse precede credentials and submission.
      if (invocation.command === "rigging run")
        directory = await MediaFiles.prepare(invocation.out);
      check();
      let ggOrigin: string | undefined;
      if (invocation.provider === "gg") {
        // GRIDA-SEC-006 / GRIDA-GG: provider — scoped, memory-only organization
        // authority. Explicit GG never inspects a provider key or retries via BYOK.
        const runtime = await host.openAuth(
          {
            gg: {
              accept(grant) {
                gg.set({
                  access_token: grant.token,
                  expires_at: Date.parse(grant.expires_at),
                  organization: grant.organization,
                });
                return undefined;
              },
            },
          },
          host.env
        );
        check();
        const org = await new AccountClient(runtime.client).selectOrganization(
          invocation.selector
        );
        check();
        await runtime.client.requestGgAccess({ organization_id: org.id });
        check();
        ggOrigin = runtime.client.config.apiOrigin;
        credentials = await ProviderCredentials.open({ env: {}, signal });
      } else {
        credentials = await ProviderCredentials.open({
          env: host.env,
          store: () => host.openStore(host.env),
          provider: invocation.provider,
          signal,
          ...(invocation.keyStdin
            ? { stdin: { provider: invocation.provider, input: host.stdin } }
            : {}),
        });
      }
      check();
      const client = new RiggingClient({
        keys: credentials,
        http: new ProviderHttp(host.transport(ggOrigin)),
        gg,
        gg_base_url: ggOrigin,
      });
      if (parsed.feature === "rig-check") {
        const operation = await client.resolve(parsed.selection);
        check();
        const result = await operation.check({ ...parsed.input, signal });
        output.result(result, [
          `Riggable: ${result.riggable ? "yes" : "no"}`,
          `Rig type: ${result.rig_type}`,
          `Task: ${result.task.id}`,
          ...(result.task.credits_consumed === undefined
            ? []
            : [`Credits consumed: ${result.task.credits_consumed}`]),
        ]);
        return 0;
      }
      const result = await generate(client, parsed, signal);
      task = result.task;
      if (descriptor.feature !== "rigging" || !directory) throw new Error();
      // Already returned paid bytes are saved even if a signal arrived meanwhile.
      const receipt = await directory.save({ ...descriptor, task }, [
        result.glb,
      ]);
      output.result(receipt, [
        ...receipt.artifacts.map((artifact) => artifact.path),
        `Receipt: ${receipt.directory}/receipt.json`,
        `Task: ${task.id}`,
        ...(task.credits_consumed === undefined
          ? []
          : [`Credits consumed: ${task.credits_consumed}`]),
      ]);
      return 0;
    } catch (error) {
      failure(error, output, task);
      return error instanceof Cli.Failure ? 2 : 1;
    } finally {
      credentials?.dispose();
      gg.clear();
      await directory?.abandon();
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
}

async function encodedMesh(source: string, signal: AbortSignal) {
  const mesh = await MediaFiles.readMesh(
    source,
    signal,
    RiggingClient.max_mesh_bytes
  );
  return {
    data: Buffer.from(mesh.data).toString("base64"),
    media_type: mesh.media_type,
  };
}

async function generate(
  client: RiggingClient,
  parsed: Extract<RiggingOperations.Parsed, { feature: "rigging" }>,
  signal: AbortSignal
): Promise<RiggingClient.Result> {
  // Narrow the model/input pair together; each public operation rejects other skeleton types.
  switch (parsed.model_id) {
    case "tripo/rig-v1.0": {
      const operation = await client.resolve(parsed.selection);
      return operation.generate({ ...parsed.input, signal });
    }
    case "tripo/rig-v2.5": {
      const operation = await client.resolve(parsed.selection);
      return operation.generate({ ...parsed.input, signal });
    }
  }
}

function failure(
  error: unknown,
  output: Output,
  task?: RiggingClient.Task
): void {
  if (
    error instanceof Cli.Failure ||
    error instanceof CliHost.Failure ||
    error instanceof ProviderCredentials.Failure
  ) {
    output.failure({ code: error.code, message: error.message });
  } else if (error instanceof ProviderCredentialStore.Failure) {
    output.failure({
      code: error.code,
      message: ProviderStore.message(error.code),
    });
  } else if (error instanceof MediaFiles.Failure) {
    const messages = {
      input_unavailable:
        "Cannot read the explicit input. GLB files are limited to 60,000,000 bytes; JSON input to 16 MiB.",
      invalid_input:
        "Supply a GLB file or a JSON object matching grida rigging inspect. Input URLs are not fetched.",
      output_unavailable:
        "Output must be a new writable directory under an existing parent, with support for safe file publication.",
      save_failed:
        "Rigging returned bytes, but saving failed. Inspect the output before retrying; rigging was not repeated.",
      cancelled:
        "Command interrupted. An accepted request may still complete or be charged; it was not repeated.",
    };
    output.failure({
      code: error.code,
      message: messages[error.code],
      directory: error.directory,
      saved: error.saved,
      ...(task ? { task_id: task.id } : {}),
    });
  } else if (error instanceof AuthClient.Failure) {
    output.failure({
      code: error.code,
      message: "GG needs an available Grida session. Run grida auth login.",
    });
  } else if (error instanceof AccountClient.Failure) {
    output.failure({
      code: error.code,
      message: "Select an available organization with --org or --org-id.",
      choices: error.choices,
      choices_truncated: error.choices_truncated,
    });
  } else if (error instanceof RiggingOperations.Failure) {
    output.failure({
      code: error.code,
      message:
        error.code === "invalid_input"
          ? "Input does not match this operation. Run grida rigging inspect for its schema."
          : "This rigging operation is unavailable. Run grida rigging list.",
    });
  } else if (error instanceof RiggingClient.Failure) {
    output.failure({
      code: error.code,
      ...(error.task_id ? { task_id: error.task_id } : {}),
      message:
        error.code === "provider_key_required"
          ? "Configure Tripo with grida providers configure tripo, or supply TRIPO_API_KEY or --key-stdin."
          : error.code === "insufficient_credits"
            ? "Credits are insufficient for the selected funding account."
            : "Mesh operation failed. An accepted request may still be charged; no automatic retry was made.",
    });
  } else {
    output.failure({
      code: "unavailable",
      message:
        "Mesh operation could not complete. No automatic retry was made.",
      ...(task ? { task_id: task.id } : {}),
    });
  }
}
