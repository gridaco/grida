// GRIDA-SEC-004 — private launcher input for exact local MCP scopes.
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const MAX_BEARER_BYTES = 4096;
type BearerFile = "native-mcp.bearer" | "native-mcp-export.bearer";

export class NativeMcpFiles {
  readonly #bearer: string;

  private constructor(
    private readonly root: string,
    private readonly directory: BigIntStats,
    private readonly profile: string,
    private readonly profileDirectory: BigIntStats,
    private readonly filename: BearerFile,
    private readonly file: BigIntStats,
    bearer: string
  ) {
    this.#bearer = bearer;
  }

  static async capture(root: string, profile: string, filename: BearerFile) {
    if (!root || Buffer.byteLength(root) > 4096) throw invalidMcpProfile();
    const directory = await canonicalDirectory(root);
    const profileDirectory = await canonicalDirectory(profile);
    if (
      contains(root, profile) ||
      contains(profile, root) ||
      Number(profileDirectory.uid) !== process.geteuid?.() ||
      (profileDirectory.mode & 0o7777n) !== 0o700n
    )
      throw invalidMcpProfile();
    const { file, bearer } = await readBearer(
      profile,
      profileDirectory,
      filename
    );
    return new NativeMcpFiles(
      root,
      directory,
      profile,
      profileDirectory,
      filename,
      file,
      bearer
    );
  }

  selects(root: string): boolean {
    return root === this.root;
  }

  async matches(root: string): Promise<boolean> {
    if (!this.selects(root)) return false;
    try {
      return sameIdentity(this.directory, await canonicalDirectory(root));
    } catch {
      return false;
    }
  }

  async launchBearer(): Promise<string> {
    if (!(await this.matches(this.root))) throw invalidMcpProfile();
    await verifyCredential(
      this.profile,
      this.profileDirectory,
      this.file,
      this.filename
    );
    return this.#bearer;
  }
}

async function canonicalDirectory(location: string): Promise<BigIntStats> {
  if (!path.isAbsolute(location)) throw invalidMcpProfile();
  const [stat, canonical] = await Promise.all([
    fs.lstat(location, { bigint: true }),
    fs.realpath(location),
  ]).catch(() => {
    throw invalidMcpProfile();
  });
  if (!stat.isDirectory() || canonical !== location) throw invalidMcpProfile();
  return stat;
}

function sameIdentity(first: BigIntStats, second: BigIntStats): boolean {
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

export function validLocalMcpEndpoint(endpoint: string): boolean {
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
  file: BigIntStats,
  filename: BearerFile
): Promise<void> {
  const current = await fs
    .lstat(path.join(profile, filename), { bigint: true })
    .catch(() => {
      throw invalidMcpProfile();
    });
  const parent = await canonicalDirectory(profile);
  if (
    !privateBearer(current) ||
    !sameIdentity(file, current) ||
    file.size !== current.size ||
    file.mtimeNs !== current.mtimeNs ||
    file.ctimeNs !== current.ctimeNs ||
    !sameIdentity(directory, parent) ||
    Number(parent.uid) !== process.geteuid?.() ||
    (parent.mode & 0o7777n) !== 0o700n
  )
    throw invalidMcpProfile();
}

async function readBearer(
  profile: string,
  directory: BigIntStats,
  filename: BearerFile
) {
  const bytes = Buffer.alloc(MAX_BEARER_BYTES + 1);
  try {
    const handle = await fs.open(
      path.join(profile, filename),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const file = await handle.stat({ bigint: true });
      if (!privateBearer(file)) throw invalidMcpProfile();
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
      if (BigInt(length) !== file.size) throw invalidMcpProfile();
      await verifyCredential(profile, directory, file, filename);
      const bearer = bytes.toString("utf8", 0, length);
      const token = bearer.replace(/=+$/, "");
      if (!token || /[^A-Za-z0-9._~+/-]/.test(token)) throw invalidMcpProfile();
      return { file, bearer };
    } finally {
      await handle.close();
    }
  } catch {
    throw invalidMcpProfile();
  } finally {
    bytes.fill(0);
  }
}

export function invalidMcpProfile(): Error {
  return new Error("native_desktop_mcp_profile_invalid");
}
