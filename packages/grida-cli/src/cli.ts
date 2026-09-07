// GRIDA-SEC-010 / GRIDA-SEC-013 — explicit commands cannot select arbitrary credential transport.
import { parseArgs } from "node:util";

/** Static command grammar. Parsing never opens storage, browsers or connections. */
export namespace Cli {
  const help = {
    "": "Grida — account access and tools\n\nUsage: grida <command>\n\nCommands:\n  auth       Sign in and manage this CLI's session\n  account    Read your identity, organizations and credits\n  models     Discover executable models and input schemas\n  providers  Inspect explicit provider credentials\n  generate   Generate media into a new local directory\n  voices     List available speech voices\n  docs       Print canonical documentation URLs\n\nOptions: --help, --version\nUse grida <command> --help for details.",
    auth: "Usage: grida auth <command>\n\nCommands:\n  login      Sign in using the system browser\n  status     Inspect the local session (no server verification)\n  logout     Clear local credentials and request session revocation\n  storage    Inspect or explicitly migrate credential storage",
    "auth login":
      "Usage: grida auth login [--storage keyring|file] [--no-browser]\n\nSign in using the system browser. New profiles use the OS keyring.\nFile storage is an explicit alternative; the choice is saved per profile.\nUse auth storage migrate to change an existing profile's backend.\n--no-browser prints the sign-in URL for you to open on this machine.\nRequires interaction; --json and --no-input cannot start login.",
    "auth status":
      "Usage: grida auth status [--json] [--no-input]\n\nRead local session metadata without contacting the server.\nSigned-out status exits 1. Credentials are never displayed.",
    "auth logout":
      "Usage: grida auth logout [--json] [--no-input]\n\nRemove this CLI's credentials and request remote session revocation.\nUnconfirmed remote revocation exits 1; an already signed-out profile exits 0.",
    "auth storage":
      "Usage: grida auth storage <command>\n\nCommands:\n  show                      Inspect the credential backend\n  migrate <keyring|file>     Explicitly migrate this profile's credentials",
    "auth storage show":
      "Usage: grida auth storage show [--json] [--no-input]\n\nShow backend and migration metadata, without reading keyring credentials.",
    "auth storage migrate":
      "Usage: grida auth storage migrate <keyring|file> [--json] [--no-input]\n\nMigrate credentials using the auth owner's coordinated storage operation.\nAn unavailable keyring never silently falls back to a file.",
    account:
      "Usage: grida account <command>\n\nCommands:\n  view       Verify your identity and list all memberships\n  credits    Read one organization's cached credit estimate",
    "account view":
      "Usage: grida account view [--json] [--no-input]\n\nVerify your account online and list all your organization memberships.\nReads require an existing CLI session and never open login.",
    "account credits":
      "Usage: grida account credits [--org <slug> | --org-id <id>] [--json] [--no-input]\n\nRead cached USD credits and billing eligibility for an organization.\nOmit the selector only when you belong to exactly one organization.\nNumeric slugs remain slugs; --org-id selects a positive numeric ID.\nAn unknown balance is distinct from zero. Cached eligibility is not a\nguarantee that generation will succeed.",
    models:
      "Usage: grida models <list|inspect>\n\nDiscover bundled executable operations without credentials or network access.",
    "models list":
      "Usage: grida models list [--provider <provider>] [--modality image|video|audio|3d] [--kind <kind>] [--available] [--org <slug> | --org-id <id>] [--json]\n\nLists executable operations, including staged models. No provider probes.\n--available requires --provider: BYOK checks key presence; GG checks cached\norganization eligibility online. Neither guarantees model access or generation.",
    "models inspect":
      "Usage: grida models inspect --provider <provider> --model <id> [--kind <kind>] [--variant text|references|image] [--json]\n\nPrint the effective JSON input schema and native output description.\nKinds: image, video, music, sound-effect, text-to-speech, three-d.\nThe kind is inferred when unambiguous; image/video default to text input.",
    providers: "Usage: grida providers list [--json]",
    "providers list":
      "Usage: grida providers list [--json]\n\nShow explicit environment key presence, never key contents. No login or probes.\nOPENROUTER_API_KEY, AI_GATEWAY_API_KEY, FAL_KEY, ELEVENLABS_API_KEY.\nGG uses a separate Grida login and organization; no provider key.",
    generate:
      "Usage: grida generate --provider <provider> --model <id> --input @file|- --out <new-directory> [--kind <kind>] [--variant text|references|image] [--key-stdin] [--org <slug> | --org-id <id>] [--json]\n\nProviders: openrouter, vercel, fal, elevenlabs, gg.\nInspect the model first for its JSON input schema. No raw provider passthrough.\n--input reads one JSON object from an explicit file or stdin (16 MiB max).\n--key-stdin reads a BYOK key instead of its environment slot; cannot share\nstdin with JSON input. BYOK needs no Grida login. GG requires login.\n--out must name a new directory under an existing parent. Artifacts and\nreceipt.json are written locally without overwriting files.\nNo automatic generation retry. Interrupted requests may still be charged.",
    voices:
      "Usage: grida voices list --provider elevenlabs [--key-stdin] [--json]",
    "voices list":
      "Usage: grida voices list --provider elevenlabs [--key-stdin] [--json]\n\nList speech voices using the explicit ElevenLabs credential. No Grida login.",
    docs: "Usage: grida docs [command...]\n\nPrint the canonical documentation URL. Does not open a browser or fetch it.\nExamples: grida docs, grida docs account credits, grida docs auth storage",
  } as const;
  export type Topic = keyof typeof help;
  type Options = { json: boolean; noInput: boolean };
  export type Provider = "openrouter" | "vercel" | "fal" | "elevenlabs" | "gg";
  export type Kind =
    | "image"
    | "video"
    | "music"
    | "sound-effect"
    | "text-to-speech"
    | "three-d";
  export type Variant = "text" | "references" | "image";
  export type Selector = { id: number } | { name: string };
  export type MediaInvocation = Options &
    (
      | {
          command: "models list";
          provider?: Provider;
          modality?: "image" | "video" | "audio" | "3d";
          kind?: Kind;
          available: boolean;
          selector?: Selector;
        }
      | {
          command: "models inspect";
          provider: Provider;
          model: string;
          kind?: Kind;
          variant?: Variant;
        }
      | { command: "providers list" }
      | {
          command: "generate";
          provider: Provider;
          model: string;
          kind?: Kind;
          variant?: Variant;
          input: string;
          out: string;
          keyStdin: boolean;
          selector?: Selector;
        }
      | { command: "voices list"; provider: "elevenlabs"; keyStdin: boolean }
    );
  export type Invocation =
    | MediaInvocation
    | (Options &
        (
          | { command: "help"; topic: Topic }
          | { command: "version" }
          | { command: "docs"; topic: Topic }
          | {
              command: "auth login";
              storage?: "keyring" | "file";
              noBrowser: boolean;
            }
          | {
              command:
                | "auth status"
                | "auth logout"
                | "auth storage show"
                | "account view";
            }
          | { command: "auth storage migrate"; backend: "keyring" | "file" }
          | {
              command: "account credits";
              selector?: { id: number } | { name: string };
            }
        ));

  export class Failure extends Error {
    constructor(
      readonly code: "invalid_usage" | "interaction_required",
      message: string
    ) {
      super(message);
    }
  }

  export function parse(argv: string[]): Invocation {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: argv,
        allowPositionals: true,
        strict: true,
        tokens: true,
        options: {
          help: { type: "boolean", short: "h" },
          version: { type: "boolean", short: "v" },
          json: { type: "boolean" },
          "no-input": { type: "boolean" },
          "no-browser": { type: "boolean" },
          storage: { type: "string" },
          org: { type: "string" },
          "org-id": { type: "string" },
          provider: { type: "string" },
          model: { type: "string" },
          kind: { type: "string" },
          modality: { type: "string" },
          variant: { type: "string" },
          input: { type: "string" },
          out: { type: "string" },
          available: { type: "boolean" },
          "key-stdin": { type: "boolean" },
        },
      });
    } catch {
      throw usage();
    }
    const seen = new Set<string>();
    for (const token of parsed.tokens ?? []) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name)) throw usage();
      seen.add(token.name);
    }
    const { values, positionals } = parsed;
    const options = {
      json: values.json === true,
      noInput: values["no-input"] === true,
    };
    const topic = positionals.join(" ");
    const allowed = (...names: string[]) => {
      if ([...seen].some((name) => !names.includes(name))) throw usage();
    };
    if (positionals[0] === "help") {
      allowed("help");
      return {
        ...options,
        command: "help",
        topic: known(positionals.slice(1).join(" ")),
      };
    }
    if (values.help === true || (topic === "" && !values.version)) {
      allowed("help");
      return { ...options, command: "help", topic: known(topic) };
    }
    if (values.version === true) {
      allowed("version");
      if (topic !== "") throw usage();
      return { ...options, command: "version" };
    }
    if (positionals[0] === "docs") {
      allowed();
      return {
        ...options,
        command: "docs",
        topic: known(positionals.slice(1).join(" ")),
      };
    }
    if (
      topic === "auth" ||
      topic === "account" ||
      topic === "auth storage" ||
      topic === "models" ||
      topic === "providers" ||
      topic === "voices"
    ) {
      allowed();
      return { ...options, command: "help", topic };
    }
    const common = ["json", "no-input"];
    if (topic === "auth login") {
      allowed(...common, "storage", "no-browser");
      if (options.json || options.noInput)
        throw new Failure(
          "interaction_required",
          "Login needs browser interaction. Run grida auth login without --json or --no-input."
        );
      const storage = values.storage;
      if (storage !== undefined && storage !== "keyring" && storage !== "file")
        throw usage();
      return {
        ...options,
        command: topic,
        storage,
        noBrowser: values["no-browser"] === true,
      };
    }
    if (topic === "account credits") {
      allowed(...common, "org", "org-id");
      const selector = organization(values);
      return { ...options, command: topic, ...(selector ? { selector } : {}) };
    }
    if (topic === "providers list") {
      allowed(...common);
      return { ...options, command: topic };
    }
    if (topic === "models list") {
      allowed(
        ...common,
        "provider",
        "modality",
        "kind",
        "available",
        "org",
        "org-id"
      );
      const provider = choice(values.provider, [
        "openrouter",
        "vercel",
        "fal",
        "elevenlabs",
        "gg",
      ] as const);
      const kind = choice(values.kind, kinds);
      const modality = choice(values.modality, [
        "image",
        "video",
        "audio",
        "3d",
      ] as const);
      const available = values.available === true;
      const selector = organization(values);
      if (
        (available && !provider) ||
        (selector && (!available || provider !== "gg"))
      )
        throw usage();
      return {
        ...options,
        command: topic,
        provider,
        kind,
        modality,
        available,
        selector,
      };
    }
    if (topic === "voices list") {
      allowed(...common, "provider", "key-stdin");
      if (values.provider !== "elevenlabs") throw usage();
      return {
        ...options,
        command: topic,
        provider: "elevenlabs",
        keyStdin: values["key-stdin"] === true,
      };
    }
    if (topic === "models inspect" || topic === "generate") {
      allowed(
        ...common,
        "provider",
        "model",
        "kind",
        "variant",
        ...(topic === "generate"
          ? ["input", "out", "key-stdin", "org", "org-id"]
          : [])
      );
      const provider = choice(values.provider, [
        "openrouter",
        "vercel",
        "fal",
        "elevenlabs",
        "gg",
      ] as const);
      const model = values.model;
      const kind = choice(values.kind, kinds);
      const variant = choice(values.variant, [
        "text",
        "references",
        "image",
      ] as const);
      if (
        !provider ||
        typeof model !== "string" ||
        !model ||
        model.length > 256 ||
        /[\p{Cc}\p{Cf}]/u.test(model)
      )
        throw usage();
      if (topic === "models inspect")
        return { ...options, command: topic, provider, model, kind, variant };
      const input = values.input;
      const out = values.out;
      const keyStdin = values["key-stdin"] === true;
      const selector = organization(values);
      if (
        typeof input !== "string" ||
        !(input === "-" || (input.startsWith("@") && input.length > 1)) ||
        typeof out !== "string" ||
        !out ||
        input.includes("\0") ||
        out.includes("\0") ||
        (keyStdin && (input === "-" || provider === "gg")) ||
        (selector && provider !== "gg")
      )
        throw usage();
      return {
        ...options,
        command: topic,
        provider,
        model,
        kind,
        variant,
        input,
        out,
        keyStdin,
        selector,
      };
    }
    if (positionals.slice(0, 3).join(" ") === "auth storage migrate") {
      allowed(...common);
      const backend = positionals[3];
      if (
        positionals.length !== 4 ||
        (backend !== "keyring" && backend !== "file")
      )
        throw usage();
      return { ...options, command: "auth storage migrate", backend };
    }
    if (
      topic === "auth status" ||
      topic === "auth logout" ||
      topic === "auth storage show" ||
      topic === "account view"
    ) {
      allowed(...common);
      return { ...options, command: topic };
    }
    throw usage();
  }

  export function helpText(topic: Topic): string {
    return (
      help[topic] +
      "\n\n--no-input suppresses terminal interaction; the OS keyring may still request access.\nDocumentation: " +
      docsUrl(topic) +
      "\n"
    );
  }

  export function docsUrl(topic: Topic): string {
    return (
      "https://grida.co/docs/wg/cli/" +
      (topic.startsWith("auth storage")
        ? "credential-custody"
        : /^(models|providers|generate|voices)/.test(topic)
          ? "media"
          : "v1")
    );
  }

  const kinds = [
    "image",
    "video",
    "music",
    "sound-effect",
    "text-to-speech",
    "three-d",
  ] as const;
  function choice<T extends string>(
    value: unknown,
    choices: readonly T[]
  ): T | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !choices.includes(value as T))
      throw usage();
    return value as T;
  }
  function organization(values: Record<string, unknown>): Selector | undefined {
    if (values.org !== undefined && values["org-id"] !== undefined)
      throw usage();
    if (values.org !== undefined) {
      if (
        typeof values.org !== "string" ||
        !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(values.org)
      )
        throw usage();
      return { name: values.org };
    }
    const id = values["org-id"];
    if (id === undefined) return undefined;
    if (
      typeof id !== "string" ||
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id))
    )
      throw usage();
    return { id: Number(id) };
  }
  function known(value: string): Topic {
    if (!Object.hasOwn(help, value)) throw usage();
    return value as Topic;
  }
  function usage(): Failure {
    // Do not echo untrusted arguments: users sometimes paste credentials here.
    return new Failure(
      "invalid_usage",
      "Invalid command or options. Run grida --help or grida <command> --help."
    );
  }
}
