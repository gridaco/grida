#!/usr/bin/env node
// Run agent missions headlessly. See fixtures/test-agent/README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const fixtures = path.join(root, "fixtures/test-agent");

const options = {
  model: "openai/gpt-6.1-terra",
  endpoint: "https://openrouter.ai/api/v1",
  credentialHome: path.join(os.homedir(), ".grida"),
  bin: path.join(root, "target/debug/grida-agent"),
  helper: path.join(root, "target/debug/agent-kit-sandbox-helper"),
  out: null,
  /** Use the profile Grida Desktop stages instead of the runner's own. */
  desktop: false,
};
const filters = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  const take = () => argv[++i];
  if (arg === "--model") options.model = take();
  else if (arg === "--endpoint") options.endpoint = take();
  else if (arg === "--credential-home") options.credentialHome = take();
  else if (arg === "--bin") options.bin = take();
  else if (arg === "--helper") options.helper = take();
  else if (arg === "--out") options.out = take();
  else if (arg === "--desktop-profile") options.desktop = true;
  else filters.push(arg);
}
options.out ??= fs.mkdtempSync(path.join(os.tmpdir(), "grida-missions-"));
fs.mkdirSync(options.out, { recursive: true });

const missions = fs
  .readdirSync(path.join(fixtures, "missions"))
  .filter((name) => name.endsWith(".md"))
  .filter((name) => !filters.length || filters.some((f) => name.startsWith(f)))
  .sort()
  .map((name) => {
    const text = fs.readFileSync(path.join(fixtures, "missions", name), "utf8");
    const block = /```json\n([\s\S]*?)\n```/.exec(text);
    if (!block) throw new Error(`${name}: missing json run block`);
    return {
      name,
      title: /^# (.*)$/m.exec(text)?.[1] ?? name,
      ...JSON.parse(block[1]),
    };
  });

/** Every regular file under a directory, relative path → sha256, ignoring git. */
function snapshot(dir) {
  const files = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile())
        files[path.relative(dir, full)] = createHash("sha256")
          .update(fs.readFileSync(full))
          .digest("hex");
    }
  };
  walk(dir);
  return files;
}

/**
 * A launch permission profile for a preset. Read only: read the project.
 * Default: also run commands that read and write the project.
 */
function profile(preset, workspace, privateDir) {
  const write = preset !== "read-only";
  const sha256 = [
    ...createHash("sha256").update(fs.readFileSync(options.helper)).digest(),
  ];
  const file = path.join(privateDir, "profile.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      workspace: "missions",
      revision: "r1",
      primary: "project",
      directories: [
        {
          id: "project",
          name: "Project",
          path: workspace,
          generation: "g1",
          read: "allow",
          commandRead: "allow",
          ...(write && { commandReadWrite: "allow", write: "allow" }),
        },
      ],
      command: {
        helper: { path: options.helper, sha256 },
        runtimePaths: [
          "/bin",
          "/usr/bin",
          "/usr/lib",
          "/usr/share",
          "/System",
          "/Library",
          "/opt/homebrew",
          "/private/etc",
        ],
        temporaryParent: privateDir,
        diskRead: true,
        inheritEnvironment: true,
      },
    }),
    { mode: 0o600 }
  );
  return file;
}

function check(spec, workspace, before) {
  const [name, ...args] = spec.split(" ");
  const after = snapshot(workspace);
  const read = (target) => {
    const full = path.join(workspace, target);
    if (!fs.existsSync(full)) return "";
    if (fs.statSync(full).isDirectory())
      return Object.keys(snapshot(full))
        .map((file) => fs.readFileSync(path.join(full, file), "utf8"))
        .join("\n");
    return fs.readFileSync(full, "utf8");
  };
  switch (name) {
    case "tests-pass": {
      const run = spawnSync("node", ["--test"], {
        cwd: workspace,
        encoding: "utf8",
      });
      return {
        ok: run.status === 0,
        detail: (run.stdout + run.stderr)
          .split("\n")
          .filter((l) => /^# (pass|fail)/.test(l))
          .join(", "),
      };
    }
    case "unchanged": {
      const scope = args[0] ?? "";
      const changed = [
        ...new Set([...Object.keys(before), ...Object.keys(after)]),
      ].filter(
        (file) => file.startsWith(scope) && before[file] !== after[file]
      );
      return {
        ok: changed.length === 0,
        detail: changed.join(", ") || "no changes",
      };
    }
    case "contains":
      return {
        ok: read(args[0]).includes(args.slice(1).join(" ")),
        detail: args.join(" "),
      };
    case "absent":
      return {
        ok: !read(args[0]).includes(args.slice(1).join(" ")),
        detail: args.join(" "),
      };
    default:
      throw new Error(`unknown check ${spec}`);
  }
}

const results = [];
for (const mission of missions) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "grida-mission-"));
  const workspace = path.join(base, "workspace");
  const privateDir = path.join(base, "private");
  fs.cpSync(path.join(fixtures, "seeds", mission.seed), workspace, {
    recursive: true,
  });
  fs.mkdirSync(privateDir, { mode: 0o700 });
  if (mission.git) {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    execFileSync("git", ["config", "user.name", "Seed"], { cwd: workspace });
  }
  const before = snapshot(workspace);
  const permission =
    options.desktop && mission.preset === "default"
      ? execFileSync(
          path.join(root, "node_modules/.bin/tsx"),
          [
            path.join(root, "scripts/agent-missions/desktop-profile.ts"),
            fs.realpathSync(workspace),
            path.join(fs.realpathSync(privateDir), "desktop-state"),
            path.join(root, "desktop/.native-resources"),
          ],
          { encoding: "utf8" }
        ).trim()
      : profile(
          mission.preset,
          fs.realpathSync(workspace),
          fs.realpathSync(privateDir)
        );
  let session;
  const turns = [];
  const started = Date.now();
  for (const prompt of mission.prompts) {
    const args = [
      "run",
      "--state-dir",
      path.join(base, "state"),
      "--cwd",
      fs.realpathSync(workspace),
      "--permission-profile",
      permission,
      "--endpoint",
      options.endpoint,
      "--model",
      options.model,
      "--credential-home",
      options.credentialHome,
      ...(mission.mode === "plan" ? ["--mode", "plan"] : []),
      ...(session ? ["--session", session] : []),
      "--prompt",
      prompt,
    ];
    const run = spawnSync(options.bin, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const records = run.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
    const finished = records.find((record) => record.kind === "finished");
    session ??= records.find((record) => record.session_id)?.session_id;
    const usage = {};
    for (const observation of finished?.account?.inference_usage
      ?.observations ?? [])
      usage[observation.category] =
        (usage[observation.category] ?? 0) + observation.quantity;
    turns.push({
      prompt,
      exit: run.status,
      disposition: finished?.disposition ?? null,
      answer: finished?.account?.text ?? null,
      steps: finished?.account?.steps ?? null,
      tools: finished?.account?.tool_activity ?? null,
      usage,
      stderr: run.stderr.trim().split("\n").slice(-5).join("\n"),
    });
  }
  const answer = turns.map((turn) => turn.answer ?? "").join("\n");
  const checks = mission.checks.map((spec) => ({
    spec,
    ...check(spec, workspace, before),
  }));
  for (const needle of mission.answer ?? [])
    checks.push({
      spec: `answer mentions ${needle}`,
      ok: answer.toLowerCase().includes(needle.toLowerCase()),
    });
  if (mission.answer_any)
    checks.push({
      spec: `answer mentions one of ${mission.answer_any.join(", ")}`,
      ok: mission.answer_any.some((needle) =>
        answer.toLowerCase().includes(needle.toLowerCase())
      ),
    });
  for (const needle of mission.answer_absent ?? [])
    checks.push({
      spec: `answer omits ${needle}`,
      ok: !answer.includes(needle),
    });
  const passed =
    turns.every((turn) => turn.disposition === "succeeded") &&
    checks.every((c) => c.ok);
  const result = {
    mission: mission.name,
    title: mission.title,
    model: options.model,
    seconds: Math.round((Date.now() - started) / 1000),
    passed,
    turns,
    checks,
    workspace,
  };
  results.push(result);
  console.log(
    `${passed ? "PASS" : "FAIL"} ${mission.name} (${result.seconds}s) ${checks
      .filter((c) => !c.ok)
      .map((c) => c.spec)
      .join("; ")}`
  );
}

fs.writeFileSync(
  path.join(options.out, "report.json"),
  JSON.stringify(results, null, 2)
);
console.log(
  `\n${results.filter((r) => r.passed).length}/${results.length} passed. Report: ${path.join(options.out, "report.json")}`
);
