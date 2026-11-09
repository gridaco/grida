// GRIDA-SEC-004 / GRIDA-SEC-014 — trusted packaged media launch with private inherited handles.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SANDBOX = "/usr/bin/sandbox-exec";
const ACL_READER = "/bin/ls";
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
  }>;

  /**
   * Launch the packaged retained-media service. The host still owns the
   * provider pipes, the IPC socket and every listener. Platform qualification
   * is independent of permission to activate this launch in Desktop.
   */
  export function start(input: Options) {
    const plan = prepare(input);
    return spawn(
      SANDBOX,
      [...plan.sandboxArgs, plan.executable, ...plan.sidecarArgs],
      {
        cwd: plan.cwd,
        env: plan.env,
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        shell: false,
      }
    );
  }

  export function prepare(input: Options) {
    if (process.platform !== "darwin" || process.arch !== "arm64") {
      throw new Error("retained_media_platform_unqualified");
    }
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
    const asar = regular(path.join(resources, "app.asar"));
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
        "--agent=native-chat",
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

  function canonical(file: string) {
    if (path.isAbsolute(file)) {
      try {
        if (fs.realpathSync(file) === file) return file;
      } catch {
        // The launcher requires a present, canonical owner-selected root.
      }
    }
    throw new Error("retained_media_path_invalid");
  }

  function regular(file: string, executable = false) {
    canonical(file);
    const stat = fs.lstatSync(file);
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
