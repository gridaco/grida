// GRIDA-SEC-010 — bounded command grammar cannot select arbitrary account transport.
import { parseArgs } from "node:util";

/** Static command grammar. Parsing never opens storage, browsers or connections. */
export namespace Cli {
  const help = {
    "": "Grida — account access and tools\n\nUsage: grida <command>\n\nCommands:\n  auth       Sign in and manage this CLI's session\n  account    Read your identity, organizations and credits\n  docs       Print canonical documentation URLs\n\nOptions: --help, --version\nUse grida <command> --help for details.",
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
    docs: "Usage: grida docs [command...]\n\nPrint the canonical documentation URL. Does not open a browser or fetch it.\nExamples: grida docs, grida docs account credits, grida docs auth storage",
  } as const;
  export type Topic = keyof typeof help;
  type Options = { json: boolean; noInput: boolean };
  export type Invocation = Options &
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
    );

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
    if (topic === "auth" || topic === "account" || topic === "auth storage") {
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
      if (values.org !== undefined && values["org-id"] !== undefined)
        throw usage();
      if (values.org !== undefined) {
        if (
          typeof values.org !== "string" ||
          !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(values.org)
        )
          throw usage();
        return { ...options, command: topic, selector: { name: values.org } };
      }
      const id = values["org-id"];
      if (id !== undefined) {
        if (
          typeof id !== "string" ||
          !/^[1-9]\d*$/.test(id) ||
          !Number.isSafeInteger(Number(id))
        )
          throw usage();
        return { ...options, command: topic, selector: { id: Number(id) } };
      }
      return { ...options, command: topic };
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
      (topic.startsWith("auth storage") ? "credential-custody" : "v1")
    );
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
