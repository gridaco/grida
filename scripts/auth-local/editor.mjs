// GRIDA-SEC-011 — isolated editor snapshot, fixture environment, and network guard.
import { spawn, execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { readState } from "./stack.mjs";
import { guards } from "./guards.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));

// Runs a source snapshot with a private HOME and build output. Next's .env loader
// never sees the developer's files; symlinks are limited to installed dependencies.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--state") {
    throw new Error(
      "Usage: node scripts/auth-local/editor.mjs --state <fixture.json>"
    );
  }
  const state = await readState(path.resolve(args[1]));
  const setup = JSON.parse(await readFile(state.setupPath, "utf8"));
  const fixtureEnv = parseEnv(await readFile(state.editorEnvPath, "utf8"));
  if (
    setup.editorOrigin !== "http://127.0.0.1:3041" ||
    setup.apiUrl !== "http://127.0.0.1:55431" ||
    fixtureEnv.NEXT_PUBLIC_SUPABASE_URL !== setup.apiUrl ||
    fixtureEnv.GRIDA_OAUTH_ISSUER !== `${setup.apiUrl}/auth/v1` ||
    fixtureEnv.GRIDA_OAUTH_ORIGIN !== setup.editorOrigin
  ) {
    throw new Error("Expected the isolated local auth fixture origins");
  }
  const cache = path.join(state.repoRoot, ".cache", "auth-local");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(path.join(cache, "editor-"));
  const editor = path.join(workspace, "editor");
  await mkdir(editor, { mode: 0o700 });
  const files = execFileSync(
    "/usr/bin/git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "editor"],
    {
      cwd: state.repoRoot,
      encoding: "utf8",
      env: guards.childEnv(state),
    }
  )
    .split("\0")
    .filter(Boolean);
  for (const file of new Set(files)) {
    const relative = path.relative("editor", file);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Invalid source path");
    if (
      relative
        .split(path.sep)
        .some(
          (part) =>
            part.startsWith(".env") ||
            [
              ".next",
              "node_modules",
              "test-results",
              "playwright-report",
            ].includes(part)
        )
    )
      continue;
    const target = path.join(editor, relative);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await copyFile(path.join(state.repoRoot, file), target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await symlink(
    path.join(state.repoRoot, "editor", "node_modules"),
    path.join(editor, "node_modules"),
    "dir"
  );
  await symlink(
    path.join(state.repoRoot, "node_modules"),
    path.join(workspace, "node_modules"),
    "dir"
  );
  await writeFile(
    path.join(editor, "next.config.ts"),
    `import original from ${JSON.stringify(path.join(state.repoRoot, "editor", "next.config.ts"))};
export default { ...original, turbopack: { ...original.turbopack, root: ${JSON.stringify(state.repoRoot)} }, logging: false };
`
  );
  // Auth tests do not need Google Fonts. Next's own test hook supplies local CSS
  // while preserving the real layouts, login form, and consent rendering.
  const fonts = path.join(workspace, "fonts.cjs");
  await writeFile(
    fonts,
    `module.exports = ${JSON.stringify({
      "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap":
        "@font-face { font-family: 'Inter'; src: local('Arial'); font-weight: 100 900; }",
    })};\n`
  );
  const env = {
    PATH: [
      path.dirname(process.execPath),
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ].join(path.delimiter),
    HOME: state.home,
    TMPDIR: state.root,
    LANG: "en_US.UTF-8",
    ...fixtureEnv,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_GRIDA_USE_TELEMETRY: "0",
    NEXT_PUBLIC_DOCS_URL: setup.editorOrigin,
    NEXT_PUBLIC_BLOG_URL: setup.editorOrigin,
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fonts,
    NODE_OPTIONS: `--require=${JSON.stringify(path.join(scripts, "network.cjs"))}`,
  };
  const require = createRequire(
    path.join(state.repoRoot, "editor", "package.json")
  );
  const binary = require.resolve("next/dist/bin/next");
  console.log(`Local auth editor: ${setup.editorOrigin}`);
  console.log(`Isolated source/build directory: ${editor}`);
  const child = spawn(
    process.execPath,
    [binary, "dev", "--hostname", "127.0.0.1", "--port", "3041"],
    { cwd: editor, env, stdio: "inherit" }
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("Unable to start local auth editor");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch(() => {
  console.error(
    "Local auth editor failed; verify the prepared fixture and dependency installation."
  );
  process.exitCode = 1;
});
