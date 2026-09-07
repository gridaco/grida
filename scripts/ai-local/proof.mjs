// GRIDA-SEC-004 — independent package/transport proof; no Grida host is installed.
// GRIDA-SEC-006 — only synthetic, memory-only GG credentials enter the consumer.
// GRIDA-GG: provider — packaging and execution are offline.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repository = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(repository, "package.json"));
const guard = fileURLToPath(new URL("./network.cjs", import.meta.url));
const forbidden =
  /^(?:@grida\/(?!ai$|ai-models$)|@app\/|@agentclientprotocol\/|grida$|electron$|next$|react(?:-dom)?$|hono$|@hono\/|drizzle-orm$)/;
const names = ["grida-ai-models", "grida-ai"];
const reportPath = path.join(repository, ".cache/ai-local/result.json");

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    assert(
      !entry.isSymbolicLink(),
      "Package files cannot escape through symlinks"
    );
    if (entry.isDirectory()) result.push(...(await files(filename)));
    else if (entry.isFile()) result.push(filename);
  }
  return result.sort();
}

async function sourceHashes() {
  const result = {};
  for (const name of names) {
    const root = path.join(repository, "packages", name);
    for (const filename of [
      path.join(root, "package.json"),
      path.join(root, "tsdown.config.mts"),
      path.join(root, "tsconfig.json"),
      ...(await files(path.join(root, "src"))),
    ]) {
      result[path.relative(repository, filename)] = createHash("sha256")
        .update(await readFile(filename))
        .digest("hex");
    }
  }
  return result;
}

async function installed(name, source) {
  for (const search of createRequire(
    path.join(source, "package.json")
  ).resolve.paths(name) ?? []) {
    const candidate = path.join(search, name);
    try {
      const manifest = JSON.parse(
        await readFile(path.join(candidate, "package.json"), "utf8")
      );
      assert.equal(
        manifest.name,
        name,
        "The proof does not substitute dependency aliases"
      );
      return await realpath(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Required installed dependency unavailable: ${name}`);
}

async function executable(candidates) {
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate);
      if ((await lstat(resolved)).isFile()) return resolved;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    "This proof requires Node's bundled npm and a POSIX tar executable"
  );
}

async function main() {
  assert(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24+ is required"
  );
  const owned = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-ai-package-"))
  );
  const runtime = path.join(owned, "consumer");
  const childEnv = {
    PATH: path.dirname(process.execPath),
    HOME: path.join(owned, "home"),
    TMPDIR: path.join(owned, "tmp"),
    TEMP: path.join(owned, "tmp"),
    TMP: path.join(owned, "tmp"),
    XDG_CONFIG_HOME: path.join(owned, "home/config"),
    XDG_DATA_HOME: path.join(owned, "home/data"),
    CI: "1",
    NO_COLOR: "1",
  };
  const report = {
    runtime: process.version,
    platform: process.platform,
    architecture: process.arch,
    passed: false,
    phase: "setup",
  };
  const run = (args, cwd, extra = {}) =>
    execute(process.execPath, args, {
      cwd,
      env: { ...childEnv, ...extra },
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
  try {
    for (const directory of [
      runtime,
      childEnv.HOME,
      childEnv.TMPDIR,
      path.join(owned, "archives"),
    ]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
    }
    const npm = await executable([
      path.resolve(
        path.dirname(process.execPath),
        "../lib/node_modules/npm/bin/npm-cli.js"
      ),
      path.join(
        path.dirname(process.execPath),
        "node_modules/npm/bin/npm-cli.js"
      ),
    ]);
    const tar = await executable(["/usr/bin/tar", "/bin/tar"]);
    const { default: semver } = await import(
      pathToFileURL(createRequire(npm).resolve("semver")).href
    );
    const tsdown = pathToFileURL(require.resolve("tsdown")).href;
    const { default: ts } = await import(
      pathToFileURL(require.resolve("typescript")).href
    );
    const packed = new Map();
    const snapshots = await sourceHashes();
    const userConfig = path.join(owned, "npm-user-config");
    const globalConfig = path.join(owned, "npm-global-config");
    await writeFile(userConfig, "", { mode: 0o600 });
    await writeFile(globalConfig, "", { mode: 0o600 });
    report.archives = [];
    for (const name of names) {
      report.phase = `build and pack ${name}`;
      const source = path.join(repository, "packages", name);
      const staging = path.join(owned, "staging", name);
      await mkdir(staging, { recursive: true, mode: 0o700 });
      const manifest = JSON.parse(
        await readFile(path.join(source, "package.json"), "utf8")
      );
      await cp(
        path.join(source, "package.json"),
        path.join(staging, "package.json")
      );
      await cp(path.join(source, "README.md"), path.join(staging, "README.md"));
      for (const included of manifest.files ?? []) {
        assert(
          ["src", "dist"].includes(included),
          "Review new package files before extending the proof"
        );
        if (included !== "dist")
          await cp(path.join(source, included), path.join(staging, included), {
            recursive: true,
          });
      }
      const buildScript = path.join(owned, `build-${name}.mjs`);
      await writeFile(
        buildScript,
        `import { build } from ${JSON.stringify(tsdown)};\nawait build(${JSON.stringify(
          {
            cwd: source,
            config: path.join(source, "tsdown.config.mts"),
            outDir: path.join(staging, "dist"),
            logLevel: "silent",
          }
        )});\n`,
        { mode: 0o600 }
      );
      await run(["--require", guard, buildScript], source);
      const { stdout } = await run(
        [
          "--require",
          guard,
          npm,
          "pack",
          "--ignore-scripts",
          "--offline",
          "--workspaces=false",
          "--json",
          `--pack-destination=${path.join(owned, "archives")}`,
          `--cache=${path.join(owned, "npm-cache")}`,
          `--userconfig=${userConfig}`,
          `--globalconfig=${globalConfig}`,
          "--loglevel=error",
        ],
        staging
      );
      const [metadata] = JSON.parse(stdout);
      const archive = path.join(owned, "archives", metadata.filename);
      const listing = await execute(tar, ["-tzf", archive], {
        env: childEnv,
        timeout: 10_000,
      });
      for (const entry of listing.stdout.trim().split("\n")) {
        assert(
          entry.startsWith("package/") && !entry.split("/").includes(".."),
          "Unsafe archive entry"
        );
      }
      packed.set(manifest.name, { archive, source });
      report.archives.push({
        name: manifest.name,
        version: manifest.version,
        integrity: metadata.integrity,
      });
    }

    const instances = [];
    async function materialize(
      name,
      source,
      destination,
      ancestors = new Set()
    ) {
      assert(!forbidden.test(name), `Forbidden production dependency: ${name}`);
      assert(
        !ancestors.has(source),
        "A dependency cycle must resolve through its existing ancestor"
      );
      const manifest = JSON.parse(
        await readFile(path.join(source, "package.json"), "utf8")
      );
      await mkdir(destination, { recursive: true, mode: 0o700 });
      if (packed.has(name)) {
        await execute(
          tar,
          [
            "-xzf",
            packed.get(name).archive,
            "--strip-components=1",
            "-C",
            destination,
          ],
          {
            env: childEnv,
            timeout: 10_000,
          }
        );
      } else {
        await cp(source, destination, {
          recursive: true,
          filter: (filename) => filename !== path.join(source, "node_modules"),
        });
      }
      await files(destination); // Refuse dependency symlinks instead of inheriting the workspace.
      const shipped = JSON.parse(
        await readFile(path.join(destination, "package.json"), "utf8")
      );
      assert.deepEqual(
        shipped,
        manifest,
        "Packing must preserve the actual package manifest"
      );
      instances.push({ name, version: manifest.version });
      const nextAncestors = new Set([...ancestors, source]);
      const dependencies = {
        ...manifest.peerDependencies,
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
      };
      for (const dependency of Object.keys(dependencies).sort()) {
        assert(
          !forbidden.test(dependency),
          `Forbidden declared dependency: ${dependency}`
        );
        const optional =
          dependency in (manifest.optionalDependencies ?? {}) ||
          manifest.peerDependenciesMeta?.[dependency]?.optional;
        let resolved;
        try {
          resolved = await installed(dependency, source);
        } catch (error) {
          if (
            optional &&
            error.message.startsWith(
              "Required installed dependency unavailable:"
            )
          )
            continue;
          throw error;
        }
        const dependencyManifest = JSON.parse(
          await readFile(path.join(resolved, "package.json"), "utf8")
        );
        const range = dependencies[dependency];
        if (range.startsWith("workspace:"))
          assert(
            packed.has(dependency),
            "Only packed private packages may satisfy workspace dependencies"
          );
        else
          assert(
            semver.satisfies(dependencyManifest.version, range),
            `Installed dependency does not satisfy ${dependency}@${range}`
          );
        if (nextAncestors.has(resolved)) continue;
        await materialize(
          dependency,
          resolved,
          path.join(destination, "node_modules", dependency),
          nextAncestors
        );
      }
    }
    for (const name of ["@grida/ai", "@grida/ai-models"]) {
      report.phase = "materialize declared production dependencies";
      await materialize(
        name,
        packed.get(name).source,
        path.join(runtime, "node_modules", name)
      );
    }
    report.dependencies = instances;

    let audited = 0;
    for (const name of names) {
      const source = path.join(repository, "packages", name);
      const packageName = JSON.parse(
        await readFile(path.join(source, "package.json"), "utf8")
      ).name;
      const candidates = [
        ...(await files(path.join(source, "src"))),
        ...(await files(
          path.join(runtime, "node_modules", packageName, "dist")
        )),
      ];
      for (const filename of candidates) {
        if (
          !/\.[cm]?tsx?$/.test(filename) ||
          /\.(?:test|spec)\./.test(filename)
        )
          continue;
        for (const imported of ts.preProcessFile(
          await readFile(filename, "utf8"),
          true,
          true
        ).importedFiles) {
          const specifier = imported.fileName;
          const dependency = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0];
          assert(
            !isBuiltin(specifier) && !forbidden.test(dependency),
            "Host import in source/declarations"
          );
          if (specifier.startsWith(".")) {
            const relative = path.relative(source, filename);
            if (!relative.startsWith(".."))
              assert(
                !path
                  .relative(
                    source,
                    path.resolve(path.dirname(filename), specifier)
                  )
                  .startsWith(".."),
                "Source escapes the SDK package"
              );
          }
        }
        audited++;
      }
    }
    report.audited_source_and_declaration_files = audited;
    await cp(
      fileURLToPath(new URL("./consumer.mjs", import.meta.url)),
      path.join(runtime, "consumer.mjs")
    );
    await cp(
      fileURLToPath(new URL("./video-consumer.mjs", import.meta.url)),
      path.join(runtime, "video-consumer.mjs")
    );
    await cp(
      fileURLToPath(new URL("./music-consumer.mjs", import.meta.url)),
      path.join(runtime, "music-consumer.mjs")
    );
    report.consumers = {};
    await cp(
      fileURLToPath(new URL("./sound-effect-consumer.mjs", import.meta.url)),
      path.join(runtime, "sound-effect-consumer.mjs")
    );
    for (const format of ["esm", "cjs"]) {
      report.phase = `public ${format} consumer`;
      const { stdout, stderr } = await run(
        ["--require", guard, path.join(runtime, "consumer.mjs"), format],
        runtime,
        { GRIDA_AI_PROOF_CONSUMER: "1" }
      );
      assert.equal(
        stderr,
        "",
        "The package must not emit warnings or upstream failure data"
      );
      report.consumers[format] = JSON.parse(stdout);
    }
    for (const extension of ["mts", "cts"]) {
      await writeFile(
        path.join(runtime, `consumer.${extension}`),
        `
import { ImageClient, VideoClient, MusicClient, SoundEffectClient, ProviderHttp, GridaGatewaySessionStore } from "@grida/ai";
import { byokProvidersFor } from "@grida/ai/providers";
import { models } from "@grida/ai-models";
declare const http: ProviderHttp;
const client = new ImageClient({ http, keys: { get: () => null }, gg: new GridaGatewaySessionStore() });
const providers: readonly string[] = byokProvidersFor("image").map(provider => provider.id);
async function image(): Promise<Uint8Array> {
  const operation = await client.resolve({ model_id: "example", provider: "fal" });
  const result = await operation.generate({ prompt: "Synthetic type probe", size: "1024x1024" });
  const mediaType: string = result.images[0].media_type;
  return result.images[0].data;
}
async function video(): Promise<Uint8Array> {
  const client = new VideoClient({ http, keys: { get: () => null }, gg: new GridaGatewaySessionStore() });
  const operation = await client.resolve({ model_id: "example", provider: "fal", image: true });
  const input: models.video.VideoInput = operation.input;
  const result = await operation.generate({ prompt: "Synthetic type probe", image_url: "https://assets.example.invalid/frame.png", signal: new AbortController().signal });
  const mediaType: string = result.videos[0].media_type;
  return result.videos[0].data;
}
async function music(): Promise<Uint8Array> {
  const client = new MusicClient({ http, gg: new GridaGatewaySessionStore(), gg_base_url: "https://gg.example.invalid" });
  const operation = await client.resolve({ model_id: "google/lyria-3", provider: "gg" });
  const result = await operation.generate({ prompt: "Synthetic type probe", seed: 0, signal: new AbortController().signal });
  const mediaType: "audio/mpeg" = result.audio.media_type;
  return result.audio.data;
}
async function soundEffect(): Promise<Uint8Array> {
  const client = new SoundEffectClient({ http, keys: { get: provider => null } });
  const operation = await client.resolve({ model_id: "eleven_text_to_sound_v2", provider: "elevenlabs" });
  const result = await operation.generate({ prompt: "Synthetic type probe", duration_seconds: 0.5, loop: false, prompt_influence: 0, signal: new AbortController().signal });
  const mediaType: "audio/mpeg" = result.audio.media_type;
  return result.audio.data;
}
void [client, image, video, music, soundEffect, providers, models];
`,
        { mode: 0o600 }
      );
    }
    await writeFile(
      path.join(runtime, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ESNext", "DOM", "DOM.Iterable"],
          types: [],
          skipLibCheck: false,
        },
        files: ["consumer.mts", "consumer.cts"],
      }),
      { mode: 0o600 }
    );
    report.phase = "public ESM and CJS declarations";
    await run(
      [
        path.join(path.dirname(require.resolve("typescript")), "tsc.js"),
        "-p",
        path.join(runtime, "tsconfig.json"),
      ],
      runtime
    );
    report.types =
      "ESM + CJS, NodeNext, no ambient Node types, library checking enabled";
    assert.deepEqual(
      await sourceHashes(),
      snapshots,
      "Source changed while the package proof was running"
    );
    report.source_hashes = snapshots;
    report.passed = true;
    report.phase = "complete";
  } catch (error) {
    error.proofPhase = report.phase;
    throw error;
  } finally {
    await rm(owned, { recursive: true, force: true });
    report.cleaned = true;
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  process.stdout.write(
    `AI package proof passed: ESM, CJS, declarations; ${report.dependencies.length} dependency instances.\n`
  );
}

main().catch((error) => {
  // All inputs are synthetic, but avoid printing child output or environment on failure.
  process.stderr.write(
    `AI package proof failed: ${error.proofPhase ?? "setup"}\n`
  );
  if (error.cmd?.includes("typescript/lib/tsc.js"))
    process.stderr.write(error.stdout ?? "");
  process.exitCode = 1;
});
