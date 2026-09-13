// GRIDA-SEC-014 — shared provider custody retains explicit host authority.
// GRIDA-SEC-015 — account authority enters media only through an explicit scoped GG handoff.
// GRIDA-SEC-013 — explicit CLI media authority, preflight and safe result presentation.
// GRIDA-SEC-006 — the native account owner hands off only a scoped in-memory GG grant.
// GRIDA-GG: token — one invocation, no persistence, remint or provider fallback.
import {
  GridaGatewaySessionStore,
  ImageClient,
  MediaOperations,
  MusicClient,
  ProviderHttp,
  SoundEffectClient,
  TextToSpeechClient,
  ThreeDClient,
  TripoClient,
  VideoClient,
  type ProviderHttpTransport,
} from "@grida/ai";
import { AccountClient } from "@grida/account";
import { AuthClient } from "@grida/auth";
import { ProviderCredentialStore } from "@grida/auth/providers";
import type { Readable } from "node:stream";
import { Cli } from "./cli";
import { CliHost } from "./host";
import { MediaFiles } from "./media-files";
import { MediaInput } from "./media-input";
import { MediaHttp } from "./media-http";
import { Output } from "./output";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderStore } from "./provider-store";

/** CLI composition only. Operation selection, parsing and execution belong to the SDK. */
export namespace MediaCommands {
  /** Internal host injection for boundary tests; never command/configuration input. */
  export type Host = {
    env: NodeJS.ProcessEnv;
    stdin: Readable;
    openAuth: typeof CliHost.open;
    openStore: typeof ProviderStore.open;
    transport: (ggOrigin?: string) => ProviderHttpTransport;
  };

  export async function run(
    invocation: Cli.MediaInvocation,
    output: Output,
    host: Host = {
      env: process.env,
      stdin: process.stdin,
      openAuth: CliHost.open,
      openStore: ProviderStore.open,
      transport: (ggOrigin) => new MediaHttp({ ggOrigin }).transport,
    }
  ): Promise<number> {
    const controller = new AbortController();
    const signal = controller.signal;
    const interrupt = () => controller.abort();
    const check = () => {
      if (signal.aborted) throw new MediaFiles.Failure("cancelled");
    };
    let credentials: ProviderCredentials | undefined;
    let directory: MediaFiles.Directory | undefined;
    const gg = new GridaGatewaySessionStore();
    const operations = new MediaOperations();
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    try {
      if (invocation.command === "models inspect") {
        const descriptor = MediaInput.inspect(operations, invocation);
        output.result(descriptor, MediaInput.describe(descriptor));
        return 0;
      }
      if (invocation.command === "models list") {
        let descriptors = operations
          .list({
            provider: invocation.provider,
            kind: invocation.kind,
          })
          .filter(
            (entry) =>
              (!invocation.modality ||
                modality(entry.kind) === invocation.modality) &&
              (!invocation.localImage ||
                MediaInput.localImageFlags(entry).length > 0)
          );
        let access: unknown = { checked: false };
        if (invocation.available) {
          if (invocation.provider === "gg") {
            const runtime = await host.openAuth({}, host.env);
            check();
            const credits = await new AccountClient(runtime.client).credits(
              invocation.selector
            );
            check();
            access = {
              checked: true,
              basis: "cached_credits",
              eligible: credits.billing_gate.allowed,
              provider_access: "unverified",
              credits,
            };
            if (!credits.billing_gate.allowed) descriptors = [];
          } else {
            credentials = await ProviderCredentials.open({
              env: host.env,
              store: () => host.openStore(host.env),
              provider: invocation.provider,
              signal,
            });
            const status = credentials
              .status()
              .find((entry) => entry.provider === invocation.provider)!;
            access = {
              checked: true,
              basis: "key_presence",
              provider_access: "unverified",
              ...status,
            };
            if (!status.configured) descriptors = [];
          }
        }
        const rows = descriptors.map(
          ({ input_schema, output: result, ...entry }) => ({
            ...entry,
            local_image_flags: MediaInput.localImageFlags({
              ...entry,
              input_schema,
              output: result,
            }),
            output: result,
          })
        );
        output.result({ operations: rows, access }, [
          ...(rows.length
            ? ["KIND  PROVIDER  MODEL  VARIANT  STATUS  LOCAL IMAGE"]
            : []),
          ...rows.map(
            (row) =>
              `${row.kind}  ${row.provider_id}  ${row.model_id}  ${row.variant}  ${row.status}  ${row.local_image_flags.join(", ") || "none"}`
          ),
          ...(rows.length ? [] : ["No matching operations."]),
          invocation.available
            ? "Access filter only; provider access and generation are unverified."
            : "Bundled operations; access has not been checked.",
        ]);
        return 0;
      }
      if (invocation.command === "providers list") {
        credentials = await ProviderCredentials.open({
          env: host.env,
          signal,
          store: () => host.openStore(host.env),
        });
        const providers = credentials.status();
        output.result(
          {
            providers,
            storage: "shared_plaintext_file",
            gg: { authentication: "grida_login", checked: false },
          },
          [
            ...providers.map(
              (row) =>
                `${row.provider}: ${row.configured ? "configured" : "missing"} (${row.source ?? "no key"}; ${row.environment})`
            ),
            "Stored keys use shared plaintext credentials.toml with private permissions.",
            "gg: Grida login and organization required; access not checked.",
          ]
        );
        return 0;
      }

      // Resolve the contract and validate all JSON before opening keys/account custody.
      const descriptor =
        invocation.command === "generate"
          ? MediaInput.inspect(operations, invocation)
          : undefined;
      const parsed =
        invocation.command === "generate"
          ? operations.parseInput(
              MediaInput.selector(descriptor!),
              await MediaInput.read(descriptor!, invocation, signal, host.stdin)
            )
          : undefined;
      check();
      if (invocation.command === "generate")
        directory = await MediaFiles.prepare(invocation.out);
      check();
      let ggOrigin: string | undefined;
      if (invocation.provider === "gg") {
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
        // The SDK receives an empty BYOK reader for GG; no environment key is inspected.
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
      const http = new ProviderHttp(host.transport(ggOrigin));
      if (invocation.command === "voices list") {
        const voices = await new TextToSpeechClient({
          keys: credentials,
          http,
        }).listVoices({ provider: "elevenlabs", signal });
        check();
        output.result(
          { provider: "elevenlabs", voices },
          voices.map((voice) => `${voice.voice_id}  ${voice.name}`)
        );
        return 0;
      }
      const artifacts = await generate(
        parsed!,
        { http, keys: credentials, gg, ggOrigin },
        signal
      );
      // Bytes may already have cost money. Once returned, finish saving even if
      // interrupted; cancelling a local write cannot cancel accepted upstream work.
      const receipt = await directory!.save(descriptor!, artifacts);
      output.result(receipt, [
        ...receipt.artifacts.map((artifact) => artifact.path),
        `Receipt: ${receipt.directory}/receipt.json`,
      ]);
      return 0;
    } catch (error) {
      failure(error, output);
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

function modality(
  kind: MediaOperations.Kind
): "image" | "video" | "audio" | "3d" {
  switch (kind) {
    case "image":
    case "video":
      return kind;
    case "three-d":
      return "3d";
    default:
      return "audio";
  }
}

async function generate(
  parsed: MediaOperations.Parsed,
  host: {
    http: ProviderHttp;
    keys: ProviderCredentials;
    gg: GridaGatewaySessionStore;
    ggOrigin?: string;
  },
  signal: AbortSignal
): Promise<readonly MediaFiles.Artifact[]> {
  const check = () => {
    if (signal.aborted) throw new MediaFiles.Failure("cancelled");
  };
  switch (parsed.kind) {
    case "image": {
      const operation = await new ImageClient({
        keys: host.keys,
        http: host.http,
        gg: host.gg,
        gg_base_url: host.ggOrigin,
      }).resolve(parsed.selection);
      check();
      return (await operation.generate({ ...parsed.input, signal })).images;
    }
    case "video": {
      const operation = await new VideoClient({
        keys: host.keys,
        http: host.http,
        gg: host.gg,
        gg_base_url: host.ggOrigin,
      }).resolve(parsed.selection);
      check();
      return (await operation.generate({ ...parsed.input, signal })).videos;
    }
    case "music": {
      if (!host.ggOrigin) throw new MusicClient.Failure("gg_token_expired");
      const operation = await new MusicClient({
        http: host.http,
        gg: host.gg,
        gg_base_url: host.ggOrigin,
      }).resolve(parsed.selection);
      check();
      return [(await operation.generate({ ...parsed.input, signal })).audio];
    }
    case "sound-effect": {
      const operation = await new SoundEffectClient({
        keys: host.keys,
        http: host.http,
      }).resolve(parsed.selection);
      check();
      return [(await operation.generate({ ...parsed.input, signal })).audio];
    }
    case "text-to-speech": {
      const operation = await new TextToSpeechClient({
        keys: host.keys,
        http: host.http,
      }).resolve(parsed.selection);
      check();
      return [(await operation.generate({ ...parsed.input, signal })).audio];
    }
    case "three-d": {
      if (parsed.provider_id === "tripo" || parsed.provider_id === "gg")
        return generateTripo(parsed, host, signal);
      const client = new ThreeDClient({ keys: host.keys, http: host.http });
      // Exact endpoint contracts keep future 3D capabilities from inheriting an
      // accidental universal shape. Each new contract earns an explicit branch.
      switch (parsed.model_id) {
        case "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
        case "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
        case "fal-ai/trellis-2": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
      }
    }
  }
}

async function generateTripo(
  parsed: Extract<MediaOperations.Parsed, { feature: "model-generation" }>,
  host: {
    keys: ProviderCredentials;
    http: ProviderHttp;
    gg: GridaGatewaySessionStore;
    ggOrigin?: string;
  },
  signal: AbortSignal
): Promise<readonly MediaFiles.Artifact[]> {
  const client = new TripoClient({
    keys: host.keys,
    http: host.http,
    gg: host.gg,
    gg_base_url: host.ggOrigin,
  });
  const check = () => {
    if (signal.aborted) throw new MediaFiles.Failure("cancelled");
  };
  // Preserve the SDK's correlation between model controls and input variant.
  // H3.1 owns geometry_quality; P1/P2 share the narrower controls.
  switch (parsed.model_id) {
    case "tripo/h3.1":
      switch (parsed.variant) {
        case "text": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
        case "image": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
        case "multiview": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
      }
      break;
    case "tripo/p1":
    case "tripo/p2":
      switch (parsed.variant) {
        case "text": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
        case "image": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
        case "multiview": {
          const operation = await client.resolve(parsed.selection);
          check();
          return [(await operation.generate({ ...parsed.input, signal })).glb];
        }
      }
  }
}

function failure(error: unknown, output: Output) {
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
        "Cannot read the explicit JSON input (16 MiB maximum).",
      invalid_input:
        "Input must be one valid UTF-8 JSON object matching the model schema.",
      output_unavailable:
        "Output must be a new writable directory under an existing parent, with support for safe file publication.",
      save_failed:
        "Generation returned bytes, but saving failed. Inspect the output directory before retrying; generation was not repeated.",
      cancelled:
        "Command interrupted. An accepted upstream request may still complete or be charged; it was not repeated.",
    };
    output.failure({
      code: error.code,
      message: messages[error.code],
      directory: error.directory,
      saved: error.saved,
    });
  } else if (error instanceof AuthClient.Failure) {
    output.failure({
      code: error.code,
      message:
        error.code === "signed_out" || error.code === "token_rejected"
          ? "GG needs a Grida session. Run grida auth login."
          : "Grida account access failed. Inspect auth status and credential storage before retrying.",
    });
  } else if (error instanceof AccountClient.Failure) {
    output.failure({
      code: error.code,
      message: "Select an available organization with --org or --org-id.",
      choices: error.choices,
      choices_truncated: error.choices_truncated,
    });
  } else if (error instanceof MediaOperations.Failure) {
    output.failure({
      code: error.code,
      message:
        error.code === "invalid_input"
          ? "Input does not match the selected operation. Run grida models inspect for its schema."
          : "This provider/model/input variant has no supported operation. Run grida models list.",
    });
  } else if (
    error instanceof ImageClient.Failure ||
    error instanceof VideoClient.Failure ||
    error instanceof MusicClient.Failure ||
    error instanceof SoundEffectClient.Failure ||
    error instanceof TextToSpeechClient.Failure ||
    error instanceof ThreeDClient.Failure ||
    error instanceof TripoClient.Failure
  ) {
    output.failure({
      code: error.code,
      ...(error instanceof TripoClient.Failure && error.task_id
        ? { task_id: error.task_id }
        : {}),
      message:
        error.code === "provider_key_required"
          ? "Configure the selected provider with grida providers configure, or supply its environment key or --key-stdin."
          : error.code === "insufficient_credits"
            ? "Credits are insufficient for the selected funding account."
            : "Media operation failed. An accepted request may still be charged; no automatic retry was made.",
    });
  } else {
    output.failure({
      code: "unavailable",
      message:
        "Media operation could not complete. No automatic retry was made.",
    });
  }
}
