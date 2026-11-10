// GRIDA-SEC-004 — one trusted local MCP peer for an exact Desktop workspace.
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const PREFIX = "--native-chat-mcp-";
const BEARER_FILE = "native-mcp.bearer";
const BEARER_ENV = "GRIDA_DESKTOP_MCP_BEARER";
const MAX_BEARER_BYTES = 4096;
const MAX_TOOLS = 16;

export class NativeMcpLaunch {
  readonly #bearer: string;
  #gatewayScope: string | undefined;

  private constructor(
    private readonly root: string,
    private readonly directory: BigIntStats,
    private readonly endpoint: string,
    private readonly source: string,
    private readonly tools: readonly string[],
    private readonly credential: Readonly<{
      profile: string;
      directory: BigIntStats;
      file: BigIntStats;
    }>,
    bearer: string
  ) {
    this.#bearer = bearer;
  }

  static async configure(
    argv: readonly string[],
    browserProfile: string,
    provider: "gateway" | "chatgpt"
  ): Promise<NativeMcpLaunch | undefined> {
    const separator = argv.indexOf("--");
    const options = (separator < 0 ? argv : argv.slice(0, separator)).filter(
      (arg) => arg.startsWith(PREFIX)
    );
    if (!options.length) return undefined;
    if (provider !== "gateway" || options.length > MAX_TOOLS + 3)
      throw invalid();

    const singles = new Map<string, string>();
    const tools: string[] = [];
    for (const option of options) {
      const separator = option.indexOf("=");
      const key = option.slice(PREFIX.length, separator);
      const value = option.slice(separator + 1);
      if (separator < 0 || !value) throw invalid();
      if (key === "tool") {
        tools.push(value);
      } else {
        if (!["root", "endpoint", "source"].includes(key) || singles.has(key))
          throw invalid();
        singles.set(key, value);
      }
    }
    const root = singles.get("root");
    const endpoint = singles.get("endpoint");
    const source = singles.get("source");
    if (
      !root ||
      Buffer.byteLength(root) > 4096 ||
      !endpoint ||
      !validEndpoint(endpoint) ||
      !source ||
      source.length > 16 ||
      /[^a-z0-9]/.test(source) ||
      !tools.length ||
      tools.length > MAX_TOOLS ||
      new Set(tools).size !== tools.length ||
      tools.some(
        (tool) =>
          /[^A-Za-z0-9_-]/.test(tool) || source.length + tool.length + 5 > 64
      )
    )
      throw invalid();

    const directory = await canonicalDirectory(root);
    const profile = await canonicalDirectory(browserProfile);
    if (
      contains(root, browserProfile) ||
      contains(browserProfile, root) ||
      Number(profile.uid) !== process.geteuid?.() ||
      (profile.mode & 0o7777n) !== 0o700n
    )
      throw invalid();
    const { file, bearer } = await readBearer(browserProfile, profile);
    return new NativeMcpLaunch(
      root,
      directory,
      endpoint,
      source,
      Object.freeze(tools),
      { profile: browserProfile, directory: profile, file },
      bearer
    );
  }

  forWorkspace(root: string): NativeMcpLaunch | undefined {
    return root === this.root ? this : undefined;
  }

  async extendChild(
    root: string,
    gatewayScope: string,
    args: string[],
    environment: NodeJS.ProcessEnv
  ): Promise<void> {
    if (
      root !== this.root ||
      gatewayScope.length !== 64 ||
      /[^a-f0-9]/.test(gatewayScope)
    )
      throw invalid();
    const directory = await canonicalDirectory(root);
    if (!sameDirectory(this.directory, directory)) throw invalid();
    await verifyCredential(
      this.credential.profile,
      this.credential.directory,
      this.credential.file
    );
    // Check and bind without yielding so overlapping launches cannot acquire
    // this peer for different account, organization, or origin scopes.
    if (this.#gatewayScope !== undefined && this.#gatewayScope !== gatewayScope)
      throw new Error("native_desktop_mcp_gateway_scope_changed");
    this.#gatewayScope = gatewayScope;
    args.push(
      "--mcp-endpoint",
      this.endpoint,
      "--mcp-token-env",
      BEARER_ENV,
      "--mcp-source",
      this.source
    );
    for (const tool of this.tools) args.push("--mcp-tool", tool);
    environment[BEARER_ENV] = this.#bearer;
  }
}

async function canonicalDirectory(location: string): Promise<BigIntStats> {
  if (!path.isAbsolute(location)) throw invalid();
  const [stat, canonical] = await Promise.all([
    fs.lstat(location, { bigint: true }),
    fs.realpath(location),
  ]).catch(() => {
    throw invalid();
  });
  if (!stat.isDirectory() || canonical !== location) throw invalid();
  return stat;
}

function sameDirectory(first: BigIntStats, second: BigIntStats): boolean {
  return (
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.birthtimeNs === second.birthtimeNs
  );
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
}

function validEndpoint(endpoint: string): boolean {
  if (Buffer.byteLength(endpoint) > 2048) return false;
  const parts =
    /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})(\/[^\s\\]*)$/.exec(
      endpoint
    );
  if (!parts || Number(parts[1]) > 65535) return false;
  const url = URL.parse(endpoint);
  return Boolean(url && !url.search && !url.hash && url.pathname === parts[2]);
}

function privateBearer(file: BigIntStats): boolean {
  const permissions = file.mode & 0o7777n;
  return (
    file.isFile() &&
    Number(file.uid) === process.geteuid?.() &&
    file.nlink === 1n &&
    (permissions === 0o600n || permissions === 0o400n) &&
    file.size > 0n &&
    file.size <= BigInt(MAX_BEARER_BYTES)
  );
}

async function verifyCredential(
  profile: string,
  directory: BigIntStats,
  file: BigIntStats
): Promise<void> {
  const current = await fs
    .lstat(path.join(profile, BEARER_FILE), { bigint: true })
    .catch(() => {
      throw invalid();
    });
  const parent = await canonicalDirectory(profile);
  if (
    !privateBearer(current) ||
    !sameDirectory(file, current) ||
    file.size !== current.size ||
    file.mtimeNs !== current.mtimeNs ||
    file.ctimeNs !== current.ctimeNs ||
    !sameDirectory(directory, parent) ||
    Number(parent.uid) !== process.geteuid?.() ||
    (parent.mode & 0o7777n) !== 0o700n
  )
    throw invalid();
}

async function readBearer(profile: string, directory: BigIntStats) {
  const bytes = Buffer.alloc(MAX_BEARER_BYTES + 1);
  try {
    const handle = await fs.open(
      path.join(profile, BEARER_FILE),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const file = await handle.stat({ bigint: true });
      if (!privateBearer(file)) throw invalid();
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          length,
          bytes.length - length,
          length
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (BigInt(length) !== file.size) throw invalid();
      await verifyCredential(profile, directory, file);
      const bearer = bytes.toString("utf8", 0, length);
      const token = bearer.replace(/=+$/, "");
      if (!token || /[^A-Za-z0-9._~+/-]/.test(token)) throw invalid();
      return { file, bearer };
    } finally {
      await handle.close();
    }
  } catch {
    throw invalid();
  } finally {
    bytes.fill(0);
  }
}

function invalid(): Error {
  return new Error("native_desktop_mcp_profile_invalid");
}
