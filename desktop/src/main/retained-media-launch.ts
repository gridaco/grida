// GRIDA-SEC-004 / GRIDA-SEC-014 — trusted packaged media launch with private inherited handles.
import { execFile, spawn } from "node:child_process";
import fs, { type BigIntStats } from "node:fs";
import files from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { AuthStore, SecretsStore } from "@grida/daemon/server";

const SANDBOX = "/usr/bin/sandbox-exec";
const ACL_READER = "/bin/ls";
const SETTINGS_DIRECTORY = "retained-settings";
const ENDPOINTS = "endpoints.json";
const SETTINGS_OWNER = ".source";
const MAX_ENDPOINTS_BYTES = 16 * 1024 * 1024;
const PRIVATE_READ = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const execute = promisify(execFile);
const SYSTEM_RUNTIME = ["/System/Library", "/usr/lib"];
// Node's bootstrap calls uname as well as querying its CPU and page limits.
const SYSTEM_METADATA = [
  "hw.activecpu",
  "hw.logicalcpu",
  "hw.machine",
  "hw.memsize",
  "hw.ncpu",
  "hw.pagesize",
  "hw.pagesize_compat",
  "hw.physicalcpu",
  "kern.hostname",
  "kern.osproductversion",
  "kern.osrelease",
  "kern.ostype",
  "kern.version",
];

export namespace RetainedMediaLaunch {
  export type Options = Readonly<{
    executable: string;
    settings: string;
    providerHome: string;
    media: string;
    temporary: string;
    editorBaseUrl: string;
    mediaOnly?: boolean;
  }>;

  /** The caller has retired the original settings writer before preparing this partition. */
  export async function prepareSettings(source: string): Promise<string> {
    requireQualifiedPlatform();
    const agent = privateDirectory(source);
    await refuseAdditionalAccess(agent);
    const identity = await files.lstat(agent, { bigint: true });
    const receipt = Buffer.from(
      `${JSON.stringify({ version: 1, source: fileIdentity(identity) })}\n`
    );
    const settings = path.join(agent, SETTINGS_DIRECTORY);
    if (await statIfPresent(settings)) return verifySettings(settings, receipt);

    const original = path.join(agent, ENDPOINTS);
    const endpoint = await readSettingsFile(original, MAX_ENDPOINTS_BYTES);
    const stage = await files.mkdtemp(path.join(agent, ".retained-settings-"));
    try {
      if (endpoint)
        await writeSettingsFile(path.join(stage, ENDPOINTS), endpoint.bytes);
      await writeSettingsFile(path.join(stage, SETTINGS_OWNER), receipt);
      await syncSettingsDirectory(stage);
      if (
        fileIdentity(
          await files.lstat(privateDirectory(agent), { bigint: true })
        ) !== fileIdentity(identity) ||
        !sameSnapshot(endpoint?.stat, await statIfPresent(original))
      )
        throw new Error("retained_media_settings_source_changed");
      if (await statIfPresent(settings))
        return await verifySettings(settings, receipt);
      try {
        await files.rename(stage, settings);
      } catch (error) {
        // A competing publisher leaves a nonempty directory. Never replace
        // its accepted settings, including an explicit endpoint deletion.
        if (
          !["EEXIST", "ENOTEMPTY"].includes(
            (error as NodeJS.ErrnoException).code ?? ""
          )
        )
          throw error;
        return await verifySettings(settings, receipt);
      }
      await syncSettingsDirectory(agent);
      return settings;
    } finally {
      await files.rm(stage, { recursive: true, force: true });
    }
  }

  async function verifySettings(
    settings: string,
    receipt: Buffer
  ): Promise<string> {
    privateDirectory(settings);
    await refuseAdditionalAccess(settings);
    const owner = await readSettingsFile(
      path.join(settings, SETTINGS_OWNER),
      receipt.length
    );
    if (!owner?.bytes.equals(receipt))
      throw new Error("retained_media_settings_unverified");
    const endpoint = await statIfPresent(path.join(settings, ENDPOINTS));
    if (endpoint) checkSettingsFile(endpoint, MAX_ENDPOINTS_BYTES);
    await syncSettingsDirectory(path.dirname(settings));
    return settings;
  }

  async function refuseAdditionalAccess(directory: string) {
    const { stdout } = await execute(ACL_READER, ["-lde", directory], {
      env: { LC_ALL: "C", LANG: "C" },
      maxBuffer: 65_536,
      timeout: 2_000,
    });
    if (/^\s*\d+:.*\ballow\b/m.test(stdout))
      throw new Error("retained_media_directory_invalid");
  }

  async function readSettingsFile(filename: string, limit: number) {
    const handle = await files
      .open(filename, PRIVATE_READ | fs.constants.O_NONBLOCK)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    if (!handle) return undefined;
    try {
      const stat = await handle.stat({ bigint: true });
      checkSettingsFile(stat, limit);
      const bytes = Buffer.alloc(Number(stat.size) + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (
        bytesRead !== Number(stat.size) ||
        !sameSnapshot(stat, await statIfPresent(filename))
      )
        throw new Error("retained_media_settings_source_changed");
      return { bytes: bytes.subarray(0, bytesRead), stat };
    } finally {
      await handle.close();
    }
  }

  function checkSettingsFile(stat: BigIntStats, limit: number) {
    if (
      !stat.isFile() ||
      stat.uid !== BigInt(process.geteuid!()) ||
      stat.nlink !== 1n ||
      (stat.mode & 0o7022n) !== 0n ||
      stat.size > BigInt(limit)
    )
      throw new Error("retained_media_settings_file_invalid");
  }

  async function writeSettingsFile(filename: string, bytes: Buffer) {
    const handle = await files.open(filename, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function syncSettingsDirectory(directory: string) {
    const handle = await files.open(
      directory,
      PRIVATE_READ | fs.constants.O_DIRECTORY
    );
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function statIfPresent(
    filename: string
  ): Promise<BigIntStats | undefined> {
    try {
      return await files.lstat(filename, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  function sameSnapshot(before?: BigIntStats, after?: BigIntStats): boolean {
    if (!before || !after) return before === after;
    return (
      fileIdentity(before) === fileIdentity(after) &&
      before.size === after.size &&
      before.mtimeNs === after.mtimeNs &&
      before.ctimeNs === after.ctimeNs
    );
  }

  function fileIdentity(stat: BigIntStats): string {
    return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
  }

  /**
   * Launch the packaged retained-media service. The host still owns the
   * provider pipes, the IPC socket and every listener. Platform qualification
   * is independent of permission to activate this launch in Desktop.
   */
  export function start(input: Options) {
    const plan = prepare(input);
    const source = privateDirectory(input.providerHome);
    const provider = path.join(source, "providers");
    const sourceIdentity = fileIdentity(fs.lstatSync(source, { bigint: true }));
    const providerIdentity = fileIdentity(
      fs.lstatSync(provider, { bigint: true })
    );
    const custody = new SecretsStore(new AuthStore(source), source);
    const child = spawn(
      SANDBOX,
      [...plan.sandboxArgs, plan.executable, ...plan.sidecarArgs],
      {
        cwd: plan.cwd,
        env: plan.env,
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        shell: false,
      }
    );
    return Object.freeze({
      child,
      prepareProviderCustody: async () => {
        await refuseAdditionalAccess(source);
        if (
          !child.connected ||
          child.killed ||
          child.exitCode !== null ||
          child.signalCode !== null ||
          fileIdentity(
            fs.lstatSync(privateDirectory(source), { bigint: true })
          ) !== sourceIdentity ||
          fileIdentity(
            fs.lstatSync(privateDirectory(provider), { bigint: true })
          ) !== providerIdentity
        )
          throw new Error("provider_custody_unavailable");
        await custody.prepareSharedCustody();
      },
    });
  }

  export function prepare(input: Options) {
    requireQualifiedPlatform();
    const executable = regular(input.executable, true);
    const macos = path.dirname(executable);
    const contents = path.dirname(macos);
    const application = path.dirname(contents);
    const resources = path.join(contents, "Resources");
    if (
      path.basename(macos) !== "MacOS" ||
      path.basename(contents) !== "Contents" ||
      !application.endsWith(".app")
    ) {
      throw new Error("retained_media_package_invalid");
    }
    for (const directory of [application, contents, macos, resources]) {
      const stat = fs.lstatSync(canonical(directory));
      if (!stat.isDirectory() || (stat.mode & 0o022) !== 0) {
        throw new Error("retained_media_package_invalid");
      }
    }
    // Electron Main presents an ASAR as a virtual directory through node:fs.
    // The kernel profile must bind the actual, regular archive on disk.
    const physicalFs = process.versions.electron
      ? (createRequire(process.execPath)("original-fs") as typeof fs)
      : fs;
    const asar = regular(path.join(resources, "app.asar"), false, physicalFs);
    regular(SANDBOX, true);
    regular(ACL_READER, true);
    const settings = privateDirectory(input.settings);
    const providerHome = canonical(input.providerHome);
    const provider = privateDirectory(path.join(providerHome, "providers"));
    const media = privateDirectory(input.media);
    const temporary = privateDirectory(input.temporary);
    const writable = [settings, provider, media, temporary];
    const roots = [
      ...writable,
      application,
      ...SYSTEM_RUNTIME,
      SANDBOX,
      ACL_READER,
    ];
    for (let i = 0; i < roots.length; i++) {
      for (let j = i + 1; j < roots.length; j++) {
        if (contains(roots[i], roots[j]) || contains(roots[j], roots[i])) {
          throw new Error("retained_media_scope_overlap");
        }
      }
    }
    const url = new URL(input.editorBaseUrl);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    ) {
      throw new Error("retained_media_origin_invalid");
    }
    return {
      executable,
      sandboxArgs: profile(executable, application, writable),
      sidecarArgs: [
        path.join(asar, ".vite", "build", "agent-sidecar.js"),
        input.mediaOnly ? "--agent=disabled" : "--agent=native-chat",
        "--retained-media-scope=1",
        `--user-data=${settings}`,
        `--provider-home=${providerHome}`,
        `--media-root=${media}`,
        `--editor-base-url=${input.editorBaseUrl}`,
      ],
      cwd: temporary,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        HOME: settings,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        LANG: "C",
        LC_ALL: "C",
      },
    };
  }

  function requireQualifiedPlatform() {
    if (process.platform !== "darwin" || process.arch !== "arm64")
      throw new Error("retained_media_platform_unqualified");
  }

  function profile(
    executable: string,
    application: string,
    writable: string[]
  ) {
    const rules = [
      "(version 1)",
      "(deny default)",
      // Shared provider custody uses a fixed ls invocation to read ACL metadata.
      "(allow process-fork)",
      "(allow signal (target same-sandbox))",
      "(allow process-info* (target same-sandbox))",
      `(allow sysctl-read ${SYSTEM_METADATA.map((name) => `(sysctl-name "${name}")`).join(" ")})`,
      '(allow file-read* file-test-existence (literal "/"))',
      '(allow file-read* file-write-data (literal "/dev/null"))',
      '(allow file-read* (literal "/dev/urandom") (literal "/dev/random"))',
    ];
    const definitions: string[] = [];
    const add = (rule: string, target: string, directory: boolean) => {
      const name = `P${definitions.length / 2}`;
      definitions.push("-D", `${name}=${target}`);
      const matcher = directory ? "subpath" : "literal";
      rules.push(
        `(allow ${rule} (${matcher} (param "${name}")))`,
        `(allow file-read-metadata file-test-existence (path-ancestors (param "${name}")))`
      );
    };
    for (const target of [application, ...SYSTEM_RUNTIME]) {
      add("file-read* file-test-existence file-map-executable", target, true);
    }
    for (const target of [executable, ACL_READER]) {
      add("file-read* process-exec file-map-executable", target, false);
    }
    for (const target of writable) {
      add("file-read* file-test-existence file-write*", target, true);
    }
    return [...definitions, "-p", rules.join("\n")];
  }

  function canonical(file: string, disk = fs) {
    if (path.isAbsolute(file)) {
      try {
        if (disk.realpathSync(file) === file) return file;
      } catch {
        // The launcher requires a present, canonical owner-selected root.
      }
    }
    throw new Error("retained_media_path_invalid");
  }

  function regular(file: string, executable = false, disk = fs) {
    canonical(file, disk);
    const stat = disk.lstatSync(file);
    if (
      !stat.isFile() ||
      (stat.mode & 0o022) !== 0 ||
      (executable && (stat.mode & 0o111) === 0)
    ) {
      throw new Error("retained_media_package_invalid");
    }
    return file;
  }

  function privateDirectory(directory: string) {
    canonical(directory);
    const stat = fs.lstatSync(directory);
    if (
      !stat.isDirectory() ||
      stat.uid !== process.geteuid?.() ||
      (stat.mode & 0o7777) !== 0o700
    ) {
      throw new Error("retained_media_directory_invalid");
    }
    return directory;
  }

  function contains(root: string, candidate: string) {
    const relative = path.relative(root, candidate);
    return (
      !path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`)
    );
  }
}
