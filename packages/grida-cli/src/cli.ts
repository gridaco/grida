// GRIDA-SEC-014 — shared provider custody retains explicit host authority.
// GRIDA-SEC-010 / GRIDA-SEC-013 — explicit commands cannot select arbitrary credential transport.
import { parseArgs } from "node:util";

/** Static command grammar. Parsing never opens storage, browsers or connections. */
export namespace Cli {
  const help = {
    "": "Grida — account access and tools\n\nUsage: grida <command>\n\nCommands:\n  auth       Sign in and manage this CLI's session\n  account    Read your identity, organizations and credits\n  models     Discover executable models and input schemas\n  providers  Manage shared provider API keys\n  generate   Generate media into a new local directory\n  voices     List available speech voices\n  docs       Print canonical documentation URLs\n\nOptions: --help, --version\nUse grida <command> --help for details.",
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
      "Usage: grida models list [--provider <provider>] [--modality image|video|audio|3d] [--kind <kind>] [--local-image] [--available] [--org <slug> | --org-id <id>] [--json]\n\nLists executable operations, including staged models, with accepted local-image flags.\n--local-image filters to operations accepting --reference FILE or --image FILE.\nNo provider probes. --available requires --provider: BYOK checks key presence;\nGG checks cached organization eligibility online. Neither guarantees model access\nor generation.",
    "models inspect":
      "Usage: grida models inspect --provider <provider> --model <id> [--kind <kind>] [--variant text|references|image] [--json]\n\nShow accepted inputs and a command example; --json prints the full schema.\nKinds: image, video, music, sound-effect, text-to-speech, three-d.\nThe kind is inferred when unambiguous; image/video default to text input.",
    providers:
      "Usage: grida providers <command>\n\nCommands:\n  list                    Show key presence and effective source\n  configure <provider>    Save a shared provider API key\n  remove <provider>       Remove a shared provider API key",
    "providers configure":
      "Usage: grida providers configure <provider> [--key-stdin] [--json] [--no-input]\n\nSave an API key in shared plaintext credentials.toml with private permissions.\nDesktop and CLI use the same stored keys. No Grida login required.\nValidate format, then check OpenRouter/Vercel/fal once before saving.\nA failed check leaves stored keys unchanged. ElevenLabs saves unverified.\nWithout --key-stdin, enter the key at a hidden terminal prompt.\nAutomation requires --key-stdin; keys are never accepted as arguments.",
    "providers remove":
      "Usage: grida providers remove <provider> [--json] [--no-input]\n\nRemove the stored key for Desktop and CLI. Environment keys remain effective.\nThis does not revoke the key at its provider or sign out of Grida.",
    "providers list":
      "Usage: grida providers list [--json]\n\nShow key presence and source after static validation, never key contents.\nNo login or probes; configured does not mean provider-verified.\nStored keys use shared plaintext credentials.toml with private permissions.\nOPENROUTER_API_KEY, AI_GATEWAY_API_KEY, FAL_KEY, ELEVENLABS_API_KEY.\nGG uses a separate Grida login and organization; no provider key.",
    generate:
      "Usage: grida generate --provider <provider> --model <id> --out <new-directory> [inputs] [--kind <kind>] [--variant text|references|image] [--key-stdin] [--org <slug> | --org-id <id>] [--json]\n\nInputs:\n  --prompt TEXT | --prompt-file FILE|-    Generation instructions\n  --text TEXT | --text-file FILE|-        Speech text (with --voice ID)\n  --reference FILE|HTTPS-URL              Image reference; repeat for more\n  --image FILE|HTTPS-URL                  Image input where supported\n  --param FIELD=VALUE                     Advertised scalar option; repeat\n  --input @file|-                         Full JSON instead of the flags above\n\nExample:\n  grida generate --provider openrouter --model openai/gpt-image-2 --prompt 'Restyle this image' --reference ./photo.png --out ./result\n\nFile flags read explicit paths relative to the working directory. PNG/JPEG/static WebP\nimages are limited to 8 MiB each; the assembled JSON input is limited to 16 MiB.\nSelected files are sent inline to the selected provider; no Grida upload storage.\nRun grida models inspect for supported inputs. No raw provider passthrough.\nJSON mode never expands paths and cannot mix with request-building flags.\nMedia flags select a compatible variant; a conflicting --variant is refused.\nProviders: openrouter, vercel, fal, elevenlabs, gg.\n--key-stdin cannot share stdin with JSON or text input. Key precedence: stdin,\nenvironment, shared credentials.toml. BYOK needs no Grida login. GG requires login.\n--out must name a new directory under an existing parent. Artifacts and\nreceipt.json are written locally without overwriting files.\nNo automatic generation retry. Interrupted requests may still be charged.",
    voices:
      "Usage: grida voices list --provider elevenlabs [--key-stdin] [--json]",
    "voices list":
      "Usage: grida voices list --provider elevenlabs [--key-stdin] [--json]\n\nList speech voices using the ElevenLabs credential. No Grida login.",
    docs: "Usage: grida docs [command...]\n\nPrint the canonical documentation URL. Does not open a browser or fetch it.\nExamples: grida docs, grida docs account credits, grida docs auth storage",
  } as const;
  export type Topic = keyof typeof help;
  /** The actual offline help inventory, also used by documentation coverage checks. */
  export const topics: readonly Topic[] = Object.freeze(
    Object.keys(help) as Topic[]
  );
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
  /** Request construction is local syntax, never a second model contract. */
  export type Request = {
    prompt?: string;
    promptFile?: string;
    text?: string;
    textFile?: string;
    references?: readonly string[];
    image?: string;
    voice?: string;
    parameters: readonly { field: string; value: string }[];
  };
  export type ProviderInvocation = Options &
    (
      | {
          command: "providers configure";
          provider: Exclude<Provider, "gg">;
          keyStdin: boolean;
        }
      | { command: "providers remove"; provider: Exclude<Provider, "gg"> }
    );
  export type MediaInvocation = Options &
    (
      | {
          command: "models list";
          provider?: Provider;
          modality?: "image" | "video" | "audio" | "3d";
          kind?: Kind;
          available: boolean;
          localImage: boolean;
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
      | ({
          command: "generate";
          provider: Provider;
          model: string;
          kind?: Kind;
          variant?: Variant;
          out: string;
          keyStdin: boolean;
          selector?: Selector;
        } & (
          | { input: string; request?: never }
          | { input?: never; request: Request }
        ))
      | { command: "voices list"; provider: "elevenlabs"; keyStdin: boolean }
    );
  export type Invocation =
    | ProviderInvocation
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
          prompt: { type: "string" },
          "prompt-file": { type: "string" },
          text: { type: "string" },
          "text-file": { type: "string" },
          reference: { type: "string", multiple: true },
          image: { type: "string" },
          voice: { type: "string" },
          param: { type: "string", multiple: true },
          out: { type: "string" },
          available: { type: "boolean" },
          "local-image": { type: "boolean" },
          "key-stdin": { type: "boolean" },
        },
      });
    } catch {
      throw usage();
    }
    const seen = new Set<string>();
    for (const token of parsed.tokens ?? []) {
      if (token.kind !== "option") continue;
      if (seen.has(token.name) && !["reference", "param"].includes(token.name))
        throw usage();
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
    if (
      positionals[0] === "providers" &&
      (positionals[1] === "configure" || positionals[1] === "remove")
    ) {
      const configure = positionals[1] === "configure";
      allowed(...common, ...(configure ? ["key-stdin"] : []));
      const provider = choice(positionals[2], [
        "openrouter",
        "vercel",
        "fal",
        "elevenlabs",
      ] as const);
      if (positionals.length !== 3 || !provider) throw usage();
      if (configure) {
        const keyStdin = values["key-stdin"] === true;
        if (!keyStdin && (options.json || options.noInput))
          throw new Failure(
            "interaction_required",
            "Use --key-stdin to configure a provider without terminal interaction."
          );
        return {
          ...options,
          command: "providers configure",
          provider,
          keyStdin,
        };
      }
      return { ...options, command: "providers remove", provider };
    }
    if (topic === "models list") {
      allowed(
        ...common,
        "provider",
        "modality",
        "kind",
        "available",
        "local-image",
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
        localImage: values["local-image"] === true,
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
          ? ["input", "out", "key-stdin", "org", "org-id", ...requestFlags]
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
      const hasRequest = requestFlags.some((name) => seen.has(name));
      if (
        (input !== undefined &&
          (typeof input !== "string" ||
            !(input === "-" || (input.startsWith("@") && input.length > 1)) ||
            input.includes("\0"))) ||
        (input === undefined && !hasRequest) ||
        (input !== undefined && hasRequest) ||
        typeof out !== "string" ||
        !out ||
        out.includes("\0") ||
        (keyStdin && (input === "-" || provider === "gg")) ||
        (selector && provider !== "gg")
      )
        throw usage();
      const request = input === undefined ? requestValues(values) : undefined;
      if (
        [
          keyStdin,
          input === "-",
          request?.promptFile === "-",
          request?.textFile === "-",
        ].filter(Boolean).length > 1
      )
        throw new Failure(
          "invalid_usage",
          "Only one input can read stdin; use a file for the other input."
        );
      return {
        ...options,
        command: topic,
        provider,
        model,
        kind,
        variant,
        ...(request ? { request } : { input: input as string }),
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

  const requestFlags = [
    "prompt",
    "prompt-file",
    "text",
    "text-file",
    "reference",
    "image",
    "voice",
    "param",
  ];
  function requestValues(
    values: ReturnType<typeof parseArgs>["values"]
  ): Request {
    const scalar = (name: string) => {
      const value = values[name];
      if (value === undefined) return undefined;
      if (typeof value !== "string") throw usage();
      return value;
    };
    const source = (name: string) => {
      const value = scalar(name);
      if (value !== undefined && (!value || value.includes("\0")))
        throw usage();
      return value;
    };
    const repeated = (name: string): string[] | undefined => {
      const value = values[name];
      if (value === undefined) return undefined;
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      )
        throw usage();
      return value as string[];
    };
    const prompt = scalar("prompt"),
      promptFile = source("prompt-file");
    const text = scalar("text"),
      textFile = source("text-file");
    const references = repeated("reference"),
      image = source("image");
    if (
      (prompt !== undefined && promptFile !== undefined) ||
      (text !== undefined && textFile !== undefined) ||
      ((prompt !== undefined || promptFile !== undefined) &&
        (text !== undefined || textFile !== undefined)) ||
      (references !== undefined && image !== undefined) ||
      image === "-" ||
      references?.some(
        (value) => !value || value === "-" || value.includes("\0")
      )
    )
      throw usage();
    const fields = new Set<string>();
    const parameters = (repeated("param") ?? []).map((entry) => {
      const equals = entry.indexOf("=");
      const field = entry.slice(0, equals),
        value = entry.slice(equals + 1);
      if (equals < 1 || !/^[a-z][a-z0-9_]*$/.test(field) || fields.has(field))
        throw new Failure(
          "invalid_usage",
          "Use --param FIELD=VALUE once per advertised scalar field."
        );
      fields.add(field);
      return { field, value };
    });
    return {
      prompt,
      promptFile,
      text,
      textFile,
      references,
      image,
      voice: scalar("voice"),
      parameters,
    };
  }

  export function helpText(topic: Topic): string {
    return (
      help[topic] +
      (topic.startsWith("providers")
        ? "\n\nCredential file: ~/.grida/providers/credentials.toml\nWith an absolute GRIDA_HOME: $GRIDA_HOME/providers/credentials.toml\nPlaintext on macOS/Linux: providers directory 0700, file 0600.\nManual edits: stop Desktop and other Grida processes using this home;\npreserve version and migration metadata. Use providers remove for deletion.\nFile format and manual configuration:\nhttps://github.com/gridaco/grida/blob/main/packages/grida-auth/PROVIDER-CREDENTIALS-V1.md\nKey validation policy:\nhttps://github.com/gridaco/grida/blob/main/packages/grida-ai/README.md"
        : "") +
      "\n\n--no-input suppresses terminal interaction; the OS keyring may still request access.\nDocumentation: " +
      docsUrl(topic) +
      "\n"
    );
  }

  export function docsUrl(topic: Topic): string {
    return "https://grida.co/docs/cli" + docsPages[topic];
  }

  // Exhaustive by help topic: adding a command requires choosing its guide owner.
  const docsPages: Record<Topic, string> = {
    "": "",
    auth: "/auth",
    "auth login": "/auth",
    "auth status": "/auth",
    "auth logout": "/auth",
    "auth storage": "/auth",
    "auth storage show": "/auth",
    "auth storage migrate": "/auth",
    account: "/account",
    "account view": "/account",
    "account credits": "/account",
    models: "/models",
    "models list": "/models",
    "models inspect": "/models",
    providers: "/providers",
    "providers configure": "/providers",
    "providers remove": "/providers",
    "providers list": "/providers",
    generate: "/generate",
    voices: "/models",
    "voices list": "/models",
    docs: "",
  };

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
    const providerHelp =
      /^(providers (?:configure|remove)) (?:openrouter|vercel|fal|elevenlabs)$/.exec(
        value
      );
    if (providerHelp) value = providerHelp[1]!;
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
