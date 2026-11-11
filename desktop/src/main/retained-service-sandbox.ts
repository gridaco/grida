// GRIDA-SEC-004 / GRIDA-SEC-014 — native outer confinement for retained services.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Writable } from "node:stream";

/** The retained process owns file/media services, never model command execution. */
export class RetainedServiceSandbox {
  static readonly executable = {
    darwin: "/usr/bin/sandbox-exec",
    linux: "/usr/bin/bwrap",
  } as const;

  readonly configuration: RetainedServiceSandbox.Configuration;

  constructor(configuration: RetainedServiceSandbox.Configuration) {
    if (
      configuration.network.allowedDomains.length ||
      configuration.network.deniedDomains.length ||
      configuration.network.allowLocalBinding
    )
      throw new Error("retained_service_direct_network_forbidden");
    const paths = (values: readonly string[]) => [
      ...new Set(values.map(RetainedServiceSandbox.literal)),
    ];
    if (
      paths(configuration.filesystem.allowWrite).some(
        (value) => value === path.parse(value).root
      )
    )
      throw new Error("retained_service_root_write_forbidden");
    this.configuration = Object.freeze({
      network: Object.freeze({
        allowedDomains: [],
        deniedDomains: [],
        allowLocalBinding: false,
      }),
      filesystem: Object.freeze({
        denyRead: Object.freeze(paths(configuration.filesystem.denyRead)),
        allowRead: Object.freeze(
          paths(configuration.filesystem.allowRead ?? [])
        ),
        allowWrite: Object.freeze(paths(configuration.filesystem.allowWrite)),
        denyWrite: Object.freeze(paths(configuration.filesystem.denyWrite)),
      }),
    });
  }

  static isSupportedPlatform(platform = process.platform): boolean {
    return platform === "darwin" || platform === "linux";
  }

  /** Produces a shell-free launch. Actual launch failure never selects an unconfined retry. */
  prepare(
    executable: string,
    arguments_: readonly string[],
    host: RetainedServiceSandbox.Host = process,
    privateDirectories?: RetainedServiceSandbox.PrivateDirectories
  ): RetainedServiceSandbox.Plan {
    if (!RetainedServiceSandbox.isSupportedPlatform(host.platform))
      throw new Error("retained_service_sandbox_unavailable");
    const program = RetainedServiceSandbox.regularExecutable(executable);
    const wrapper = RetainedServiceSandbox.regularExecutable(
      RetainedServiceSandbox.executable[host.platform as "darwin" | "linux"]
    );
    const filesystem = this.configuration.filesystem;
    const canonical = (values: readonly string[]) => [
      ...new Set(values.flatMap(RetainedServiceSandbox.aliases)),
    ];
    const nativePaths = (values: readonly string[]) =>
      host.platform === "linux"
        ? [
            ...new Set(
              values.map(
                (value) => RetainedServiceSandbox.aliases(value).at(-1)!
              )
            ),
          ]
        : canonical(values);
    const configuredRead = nativePaths(filesystem.denyRead);
    const configuredWrite = nativePaths(filesystem.denyWrite);
    const allowWrite = nativePaths(filesystem.allowWrite);
    const namespace =
      host.platform === "linux" && privateDirectories
        ? new RetainedServiceSandbox.PrivateNamespace(
            privateDirectories,
            allowWrite,
            configuredRead,
            configuredWrite
          )
        : undefined;
    const privatePhysical = namespace
      ? [
          ...new Set(
            namespace.physicalRoots.map(
              (value) => RetainedServiceSandbox.aliases(value).at(-1)!
            )
          ),
        ]
      : [];
    const denyRead = [
      ...new Set([
        ...configuredRead,
        ...(namespace?.project(configuredRead) ?? []),
        ...privatePhysical,
      ]),
    ];
    const denyWrite = nativePaths([
      ...filesystem.denyWrite,
      program,
      ...(program.match(/^.*\.app(?=\/Contents\/)/)?.[0]
        ? [program.match(/^.*\.app(?=\/Contents\/)/)![0]]
        : []),
      ...(arguments_[0]?.startsWith("/")
        ? [arguments_[0].split(/(?<=\.asar)\//)[0]!]
        : []),
    ]);
    denyWrite.push(
      ...(namespace?.project(configuredWrite) ?? []),
      ...privatePhysical
    );
    if (allowWrite.some((value) => value === path.parse(value).root))
      throw new Error("retained_service_root_write_forbidden");
    const identity = RetainedServiceSandbox.identity(program);
    const wrapperIdentity = RetainedServiceSandbox.identity(wrapper);
    const recheck = () => {
      if (
        RetainedServiceSandbox.identity(program) !== identity ||
        RetainedServiceSandbox.identity(wrapper) !== wrapperIdentity
      )
        throw new Error("retained_service_executable_changed");
      namespace?.recheck();
    };
    if (host.platform === "darwin") {
      return {
        executable: wrapper,
        arguments: [
          ...RetainedServiceSandbox.seatbelt(allowWrite, denyRead, denyWrite),
          program,
          ...arguments_,
        ],
        recheck,
      };
    }
    if (host.arch !== "arm64" && host.arch !== "x64")
      throw new Error("retained_service_linux_architecture_unsupported");
    const lease = new RetainedServiceSandbox.MountLease();
    try {
      const mounts: string[] = namespace?.rootMounts() ?? [
        "--ro-bind",
        "/",
        "/",
      ];
      const writable = allowWrite
        .filter((p) => fs.existsSync(p))
        .sort((a, b) => a.length - b.length)
        .filter(
          (p, i, all) =>
            !all
              .slice(0, i)
              .some((parent) => RetainedServiceSandbox.contains(parent, p))
        );
      for (const target of writable) mounts.push("--bind", target, target);
      mounts.push(...(namespace?.mounts() ?? []));
      const readMounts: string[] = [];
      const writeMounts: string[] = [];
      const reads = [...denyRead].sort((a, b) => a.length - b.length);
      const hidden: string[] = [];
      for (const target of reads) {
        if (
          hidden.some((parent) =>
            RetainedServiceSandbox.contains(parent, target)
          )
        )
          continue;
        const present = lease.mountpoint(namespace?.physical(target) ?? target);
        if (present.isDirectory())
          readMounts.push("--tmpfs", target, "--remount-ro", target);
        else readMounts.push("--ro-bind", "/dev/null", target);
        hidden.push(target);
      }
      for (const target of denyWrite.sort((a, b) => a.length - b.length)) {
        if (
          hidden.some((parent) =>
            RetainedServiceSandbox.contains(parent, target)
          )
        )
          continue;
        const source = namespace?.physical(target) ?? target;
        lease.mountpoint(source);
        writeMounts.push("--ro-bind", source, target);
      }
      // Read masks are last: a read-only ancestor bind must never expose a
      // protected descendant that an earlier mask had hidden.
      mounts.push(...writeMounts, ...readMounts);
      return {
        executable: wrapper,
        arguments: [
          "--die-with-parent",
          "--new-session",
          "--unshare-user",
          "--disable-userns",
          "--unshare-pid",
          "--unshare-ipc",
          "--unshare-uts",
          "--unshare-net",
          "--cap-drop",
          "ALL",
          ...mounts,
          "--proc",
          "/proc",
          "--dev",
          "/dev",
          "--seccomp",
          "4",
          "--",
          program,
          ...(namespace?.arguments(arguments_) ?? arguments_),
        ],
        environment: namespace
          ? {
              TMPDIR: namespace.temporary,
              TMP: namespace.temporary,
              TEMP: namespace.temporary,
            }
          : undefined,
        seccomp: RetainedServiceSandbox.seccomp(host.arch),
        recheck,
        release: () => lease.release(),
      };
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  static ownsMountpoint(target: string): boolean {
    return RetainedServiceSandbox.MountLease.owns(target);
  }

  static start(
    plan: RetainedServiceSandbox.Plan,
    environment: NodeJS.ProcessEnv
  ): ChildProcess {
    let child: ChildProcess;
    try {
      plan.recheck();
      child = spawn(plan.executable, plan.arguments, {
        shell: false,
        env: { ...environment, ...plan.environment },
        stdio: plan.seccomp
          ? ["pipe", "pipe", "pipe", "ipc", "pipe"]
          : ["pipe", "pipe", "pipe", "ipc"],
      });
    } catch (error) {
      plan.release?.();
      throw error;
    }
    child.once("close", () => plan.release?.());
    if (plan.seccomp) {
      const channel = child.stdio[4] as Writable;
      channel.on("error", () => child.kill());
      channel.end(plan.seccomp);
    }
    return child;
  }
}

export namespace RetainedServiceSandbox {
  export type Configuration = Readonly<{
    network: Readonly<{
      allowedDomains: readonly string[];
      deniedDomains: readonly string[];
      allowLocalBinding: boolean;
    }>;
    filesystem: Readonly<{
      denyRead: readonly string[];
      allowRead?: readonly string[];
      allowWrite: readonly string[];
      denyWrite: readonly string[];
    }>;
  }>;
  export type Host = Pick<NodeJS.Process, "platform" | "arch">;
  export type Plan = {
    executable: string;
    arguments: string[];
    seccomp?: Buffer;
    environment?: NodeJS.ProcessEnv;
    recheck(): void;
    release?(): void;
  };

  export type PrivateDirectories = Readonly<{
    state: string;
    providerHome: string;
    media: string;
  }>;

  /** Mount the same authority under valid private ancestors; never repair host ownership. */
  export class PrivateNamespace {
    static readonly root = "/retained-service";
    readonly temporary = `${PrivateNamespace.root}/tmp`;
    readonly physicalRoots: string[];
    private readonly bindings: {
      source: string;
      target: string;
      identity: string;
    }[];
    private readonly homes: { flag: string; source: string; target: string }[];

    constructor(
      input: PrivateDirectories,
      writable: readonly string[],
      readDenied: readonly string[],
      writeDenied: readonly string[]
    ) {
      if (fs.existsSync(PrivateNamespace.root))
        throw new Error("retained_service_namespace_conflict");
      [input.state, input.providerHome, input.media].forEach(privateLocation);
      const provider = path.join(input.providerHome, "providers");
      const paths = [input.state, provider, input.media].map((value) =>
        privateLocation(aliases(value).at(-1)!)
      );
      for (const value of paths) {
        if (
          !writable.some((root) => contains(root, value)) ||
          [...readDenied, ...writeDenied].some((root) => contains(root, value))
        )
          throw new Error("retained_service_private_scope_denied");
      }
      const [state, providers, media] = paths.map((value, index) =>
        privateDirectory(value, index === 1)
      );
      this.bindings = [
        {
          source: state!,
          target: `${PrivateNamespace.root}/state`,
          identity: directoryIdentity(state!),
        },
        {
          source: providers!,
          target: `${PrivateNamespace.root}/custody/providers`,
          identity: directoryIdentity(providers!),
        },
        {
          source: media!,
          target: `${PrivateNamespace.root}/media`,
          identity: directoryIdentity(media!),
        },
      ];
      this.physicalRoots = [
        ...new Set([input.state, provider, input.media, ...paths].map(literal)),
      ];
      this.homes = [
        {
          flag: "user-data",
          source: literal(input.state),
          target: `${PrivateNamespace.root}/state`,
        },
        {
          flag: "provider-home",
          source: literal(input.providerHome),
          target: `${PrivateNamespace.root}/custody`,
        },
        {
          flag: "media-root",
          source: literal(input.media),
          target: `${PrivateNamespace.root}/media`,
        },
      ];
    }
    recheck(): void {
      if (
        this.bindings.some(
          (binding) => directoryIdentity(binding.source) !== binding.identity
        )
      )
        throw new Error("retained_service_private_directory_changed");
    }
    rootMounts(): string[] {
      const mounts: string[] = [];
      const entries = fs.readdirSync("/", { withFileTypes: true });
      if (entries.length > 256)
        throw new Error("retained_service_root_layout_unsupported");
      for (const entry of entries) {
        if (["proc", "dev"].includes(entry.name)) continue;
        const source = path.join("/", entry.name);
        if (source === PrivateNamespace.root)
          throw new Error("retained_service_namespace_conflict");
        if (entry.isSymbolicLink())
          mounts.push("--symlink", fs.readlinkSync(source), source);
        else mounts.push("--ro-bind", source, source);
      }
      return mounts;
    }
    mounts(): string[] {
      const roots = [PrivateNamespace.root, `${PrivateNamespace.root}/custody`];
      const mounts = roots.flatMap((root) => [
        "--dir",
        root,
        "--chmod",
        "0700",
        root,
      ]);
      for (const binding of this.bindings)
        mounts.push("--bind", binding.source, binding.target);
      mounts.push("--tmpfs", this.temporary, "--chmod", "0700", this.temporary);
      return mounts;
    }
    project(paths: readonly string[]): string[] {
      return paths.flatMap((value) =>
        this.bindings.flatMap((binding) =>
          contains(binding.source, value)
            ? [path.join(binding.target, path.relative(binding.source, value))]
            : contains(value, binding.source)
              ? [binding.target]
              : []
        )
      );
    }
    physical(value: string): string | undefined {
      const binding = this.bindings.find((candidate) =>
        contains(candidate.target, value)
      );
      return binding
        ? path.join(binding.source, path.relative(binding.target, value))
        : undefined;
    }
    arguments(input: readonly string[]): string[] {
      const found = new Set<string>();
      const output = input.map((value) => {
        const home = this.homes.find((candidate) =>
          value.startsWith(`--${candidate.flag}=`)
        );
        if (!home) return value;
        if (value !== `--${home.flag}=${home.source}` || found.has(home.flag))
          throw new Error("retained_service_private_argument_mismatch");
        found.add(home.flag);
        return `--${home.flag}=${home.target}`;
      });
      if (found.size !== this.homes.length)
        throw new Error("retained_service_private_argument_missing");
      return [
        ...output,
        ...[...this.physicalRoots, PrivateNamespace.root].map(
          (root) => `--protected-file-root=${root}`
        ),
      ];
    }
  }

  function privateLocation(value: string): string {
    if (
      !path.isAbsolute(value) ||
      path.resolve(value) !== value ||
      value === path.parse(value).root ||
      // eslint-disable-next-line no-control-regex -- Match the native credential owner's private path contract.
      /[\x00-\x1f\x7f]/.test(value) ||
      !value.isWellFormed()
    )
      throw new Error("retained_service_private_directory_invalid");
    return value;
  }

  function directoryIdentity(value: string): string {
    const stat = fs.lstatSync(value, { bigint: true });
    return `${stat.dev}:${stat.ino}:${stat.uid}:${stat.mode}`;
  }
  function privateDirectory(value: string, privateLeaf: boolean): string {
    const uid = process.geteuid?.();
    if (uid === undefined)
      throw new Error("retained_service_private_owner_unavailable");
    const segments = value.split(path.sep).filter(Boolean);
    let current = path.parse(value).root;
    for (let index = 0; index < segments.length; index++) {
      current = path.join(current, segments[index]!);
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const stat = fs.lstatSync(current);
      const leaf = index === segments.length - 1;
      const sharedTemporary = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
      if (
        !stat.isDirectory() ||
        fs.realpathSync(current) !== current ||
        (leaf
          ? stat.uid !== uid ||
            (stat.mode & (privateLeaf ? 0o077 : 0o022)) !== 0
          : (stat.uid !== uid && stat.uid !== 0) ||
            ((stat.mode & 0o022) !== 0 && !sharedTemporary))
      )
        throw new Error("retained_service_private_directory_invalid");
    }
    if (!segments.length)
      throw new Error("retained_service_private_directory_invalid");
    return value;
  }

  export function literal(value: string): string {
    if (
      !path.isAbsolute(value) ||
      value.includes("\0") ||
      /[*?[\]]/.test(value)
    )
      throw new Error("retained_service_path_not_literal");
    return path.resolve(value);
  }
  export function contains(parent: string, child: string): boolean {
    return parent === child || child.startsWith(parent + path.sep);
  }
  export function aliases(value: string): string[] {
    const lexical = literal(value);
    let parent = lexical;
    const missing: string[] = [];
    for (;;) {
      try {
        const canonical = fs.realpathSync(parent);
        return [lexical, path.join(canonical, ...missing)];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        try {
          if (fs.lstatSync(parent).isSymbolicLink())
            throw new Error("retained_service_path_alias_unresolved");
        } catch (check) {
          if ((check as NodeJS.ErrnoException).code !== "ENOENT") throw check;
        }
        missing.unshift(path.basename(parent));
        parent = path.dirname(parent);
      }
    }
  }
  export function regularExecutable(value: string): string {
    const canonical = fs.realpathSync(literal(value));
    const stat = fs.lstatSync(canonical);
    if (
      !stat.isFile() ||
      (stat.mode & 0o6022) !== 0 ||
      (stat.mode & 0o111) === 0
    )
      throw new Error("retained_service_executable_unsafe");
    return canonical;
  }
  export function identity(value: string): string {
    const stat = fs.lstatSync(value, { bigint: true });
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.mode}`;
  }

  export function seatbelt(
    writes: string[],
    readsDenied: string[],
    writesDenied: string[]
  ): string[] {
    const rules = [
      "(version 1)",
      "(deny default)",
      "(allow process-fork process-exec)",
      "(allow signal (target same-sandbox))",
      "(allow process-info* (target same-sandbox))",
      "(allow sysctl-read)",
      "(allow file-read* file-map-executable file-test-existence)",
      '(allow file-write-data (literal "/dev/null"))',
    ];
    const parameters: string[] = [];
    const add = (operation: string, target: string) => {
      const parameter = `P${parameters.length / 2}`;
      parameters.push("-D", `${parameter}=${target}`);
      rules.push(`(${operation} (subpath (param "${parameter}")))`);
      return parameter;
    };
    for (const target of writes) add("allow file-write*", target);
    const metadata = readsDenied.map((target) =>
      add("deny file-read-data file-read-xattr file-map-executable", target)
    );
    if (metadata.length) {
      // Admission revalidates the protected roots' canonical identities.
      // Only those exact roots and their ancestors retain metadata access;
      // directory listings, file contents and descendant metadata stay denied.
      const subpaths = metadata.map((name) => `(subpath (param "${name}"))`);
      const topology = metadata.flatMap((name) => [
        `(literal (param "${name}"))`,
        `(path-ancestors (param "${name}"))`,
      ]);
      rules.push(
        `(deny file-read-metadata (require-all (require-any ${subpaths.join(" ")}) (require-not (require-any ${topology.join(" ")}))))`
      );
    }
    for (const target of writesDenied) add("deny file-write*", target);
    return [...parameters, "-p", rules.join("\n")];
  }

  /** Native ABI only; new sockets, namespace changes and out-of-process descriptor acquisition are denied. */
  export function seccomp(arch: "arm64" | "x64"): Buffer {
    const audit = arch === "arm64" ? 0xc00000b7 : 0xc000003e;
    const deny =
      arch === "arm64"
        ? [
            198, 199, 425, 426, 427, 117, 270, 271, 438, 265, 280, 97, 268, 40,
            39, 41,
          ]
        : [
            41, 53, 425, 426, 427, 101, 310, 311, 438, 304, 321, 272, 308, 165,
            166, 155,
          ];
    const instructions: [number, number, number, number][] = [
      [0x20, 0, 0, 4],
      [0x15, 1, 0, audit],
      [0x06, 0, 0, 0x80000000],
      [0x20, 0, 0, 0],
    ];
    if (arch === "x64")
      instructions.push([0x35, 0, 1, 0x40000000], [0x06, 0, 0, 0x80000000]);
    // Let libc fall back to ordinary clone/fork for worker threads.
    instructions.push([0x15, 0, 1, 435], [0x06, 0, 0, 0x00050000 | 38]);
    for (const syscall of deny)
      instructions.push([0x15, 0, 1, syscall], [0x06, 0, 0, 0x00050000 | 1]);
    instructions.push([0x06, 0, 0, 0x7fff0000]);
    const filter = Buffer.alloc(instructions.length * 8);
    instructions.forEach(([code, yes, no, argument], i) => {
      filter.writeUInt16LE(code, i * 8);
      filter[i * 8 + 2] = yes;
      filter[i * 8 + 3] = no;
      filter.writeUInt32LE(argument, i * 8 + 4);
    });
    return filter;
  }

  function mountIdentity(value: string, directory: boolean): string {
    const stat = fs.lstatSync(value, { bigint: true });
    return directory
      ? `${stat.dev}:${stat.ino}:${stat.uid}:${stat.mode}`
      : identity(value);
  }

  /** Missing deny mountpoints are owned only until every launch using their inode has closed. */
  export class MountLease {
    private static readonly active = new Map<
      string,
      { identity: string; references: number; directory: boolean }
    >();
    private readonly held: string[] = [];
    static owns(target: string): boolean {
      const owned = MountLease.active.get(target);
      if (!owned) return false;
      try {
        return (
          !owned.directory &&
          owned.references > 0 &&
          identity(target) === owned.identity
        );
      } catch {
        return false;
      }
    }
    mountpoint(target: string): fs.Stats {
      const shared = MountLease.active.get(target);
      if (shared) {
        if (mountIdentity(target, shared.directory) !== shared.identity)
          throw new Error("retained_service_mountpoint_changed");
        shared.references++;
        this.held.push(target);
        return fs.lstatSync(target);
      }
      try {
        return fs.lstatSync(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      this.directory(path.dirname(target));
      const fd = fs.openSync(
        target,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          fs.constants.O_NOFOLLOW,
        0o600
      );
      fs.closeSync(fd);
      MountLease.active.set(target, {
        identity: identity(target),
        references: 1,
        directory: false,
      });
      this.held.push(target);
      return fs.lstatSync(target);
    }
    private directory(target: string): void {
      try {
        if (fs.lstatSync(target).isDirectory()) {
          const shared = MountLease.active.get(target);
          if (shared) {
            if (mountIdentity(target, true) !== shared.identity)
              throw new Error("retained_service_mountpoint_changed");
            shared.references++;
            this.held.push(target);
          }
          return;
        }
        throw new Error("retained_service_mountpoint_parent_invalid");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      this.directory(path.dirname(target));
      fs.mkdirSync(target, { mode: 0o700 });
      MountLease.active.set(target, {
        identity: mountIdentity(target, true),
        references: 1,
        directory: true,
      });
      this.held.push(target);
    }
    release(): void {
      for (const target of this.held.splice(0).reverse()) {
        const owned = MountLease.active.get(target);
        if (!owned || --owned.references !== 0) continue;
        MountLease.active.delete(target);
        try {
          if (mountIdentity(target, owned.directory) !== owned.identity)
            continue;
          if (owned.directory) fs.rmdirSync(target);
          else fs.unlinkSync(target);
        } catch {
          /* Changed, populated or unavailable paths belong to their current owner. */
        }
      }
    }
  }
}
