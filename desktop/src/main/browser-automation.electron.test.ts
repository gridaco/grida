// GRIDA-SEC-016 — automated interaction with admitted guests in disposable profiles.
import { execFile } from "node:child_process";
import { builtinModules, createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const electronTests = process.env.GRIDA_DESKTOP_TEST_ELECTRON === "1";
const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const workspaceId = "eac20941e6a410aa";
const workflow = `fx: workflow/v1
id: acceptance
title: Packaged FX acceptance
steps:
  choose:
    uses: fx/select@1
    with:
      first_of: [packaged, alternative]
`;

it.runIf(electronTests)(
  "operates on independent hidden guests and the explicitly displayed workbench guest",
  async () => {
    const temp = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-browser-automation-")
    );
    try {
      expect(await runElectron(temp)).toContain(
        "browser automation Electron scenarios passed"
      );
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  },
  45_000
);

it.runIf(electronTests && Boolean(resources) && process.platform !== "win32")(
  "discovers packaged FX, registers a plan under Default access, and revokes its real viewer binding",
  async () => {
    const temp = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-fx-acceptance-")
    );
    const cwd = path.join(temp, "workspace");
    const engine = path.join(resources!, "bundled-programs", "bin", "grida-fx");
    try {
      await fs.mkdir(path.join(cwd, "workflows"), {
        recursive: true,
        mode: 0o700,
      });
      await fs.writeFile(
        path.join(cwd, "fx.yaml"),
        "fx: project/v1\nworkflows: [workflows]\n"
      );
      await fs.writeFile(
        path.join(cwd, "workflows", "acceptance.yaml"),
        workflow
      );
      const entry = await registerPackagedPlan(temp, cwd, resources!);
      expect(
        await runElectron(temp, [engine, cwd, JSON.stringify(entry)])
      ).toContain("packaged FX Electron scenario passed");
    } finally {
      await execute(engine, ["stop", "--project", cwd, "--json"], {
        env: { GRIDA_FX_NETWORK: "off" },
        timeout: 4_000,
      }).catch(() => undefined);
      await fs.rm(temp, { recursive: true, force: true });
    }
  },
  45_000
);

async function registerPackagedPlan(
  temp: string,
  cwd: string,
  resources: string
) {
  const { NativeAgentChat } = await import("./native-agent-chat");
  const commands = [
    {
      name: "tool_search",
      arguments: { query: "plan an FX workflow", source: "desktop-fx" },
    },
    { name: "read_skill", arguments: { name: "desktop-fx/desktop-fx" } },
    {
      name: "exec_command",
      arguments: {
        access: "read",
        cmd: "command -v grida-fx && GRIDA_FX_NETWORK=off grida-fx --version",
      },
    },
    {
      name: "exec_command",
      arguments: {
        access: "read_write",
        cmd: "GRIDA_FX_NETWORK=off grida-fx plan workflows/acceptance.yaml --check --register --json",
      },
    },
  ];
  const requests: {
    tools: { name: string }[];
    input: { type: string; output?: string }[];
  }[] = [];
  const chat = await NativeAgentChat.start({
    resourcesPath: resources,
    cwd,
    stateDirectory: path.join(temp, "state"),
    workspace: {
      id: workspaceId,
      primary: { id: "project", name: "FX acceptance", path: cwd },
      additionalReadRoots: [],
      protectedPaths: [resources, path.join(temp, "state")],
    },
    provider: "responses",
    model: "gpt-6.1-sol",
    endpoint: "http://127.0.0.1:1/v1",
    providerNetwork: {
      prepare: () => async (body) => {
        const step = requests.length;
        requests.push(JSON.parse(body.toString()));
        return fixtureResponse(step, commands[step]);
      },
    },
  });
  try {
    const session = await chat.create();
    await chat.submit(
      session,
      "packaged-fx-plan",
      "Find the FX skill and register the local demonstration plan.",
      "act"
    );
    await vi.waitFor(
      async () => {
        expect((await chat.observe(session)).latest?.status).toBe("succeeded");
      },
      { timeout: 10_000 }
    );
  } finally {
    await chat.close();
  }
  expect(requests).toHaveLength(commands.length + 1);
  for (const owner of ["browser", "desktop-fx"]) {
    const readme = await fs.readFile(
      new URL(`../../../extensions/${owner}/README.md`, import.meta.url),
      "utf8"
    );
    const [heading] = readme.split("\n");
    expect(JSON.stringify(requests)).not.toContain(heading);
  }
  for (const [index, operation] of commands.entries())
    expect(requests[index].tools.map(({ name }) => name)).toContain(
      operation.name
    );
  expect(requests[0].tools.map(({ name }) => name)).not.toContain("grida-fx");
  expect(JSON.stringify(requests[0])).not.toContain("command -v grida-fx");
  const [search, skill, version, registration] = requests
    .slice(1)
    .map(({ input }) => {
      const output = input.findLast(
        ({ type }) => type === "function_call_output"
      )?.output;
      expect(output).toBeDefined();
      const result = JSON.parse(output!);
      expect(result.status).toBe("succeeded");
      return result;
    });
  expect(search.structured.matches).toEqual([
    expect.objectContaining({
      kind: "skill",
      source: "desktop-fx",
      name: "desktop-fx/desktop-fx",
    }),
  ]);
  expect(JSON.stringify(skill)).toContain(
    "grida-fx plan <workflow> --check --register --json"
  );
  const pinnedVersion = (
    await fs.readFile(
      path.join(resources, "bundled-programs", "fx-version"),
      "utf8"
    )
  ).trim();
  expect(version.content[0]).toContain("Process exited with code 0");
  expect(version.content[0]).toMatch(
    /grida-command-runtime-[^\n]+\/bin\/grida-fx\r?\n/
  );
  expect(version.content[0]).toContain(`grida-fx ${pinnedVersion}`);
  expect(registration.content[0]).toContain("Process exited with code 0");
  const plan = JSON.parse(registration.content[0].split("\nOutput:\n")[1]);
  expect(plan).toMatchObject({
    kind: "fx-plan-registration-v1",
    plan_ok: true,
    reference: {
      kind: "service_entry",
      entry_kind: "plan",
      entry_id: expect.stringMatching(/^[a-f0-9]{64}$/),
      project_id: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  });
  return plan.reference;
}

function fixtureResponse(
  step: number,
  operation: { name: string; arguments: object } | undefined
) {
  const item = operation
    ? {
        type: "function_call",
        id: `fc_fx_${step}`,
        call_id: `call_fx_${step}`,
        name: operation.name,
        arguments: JSON.stringify(operation.arguments),
        status: "completed",
      }
    : {
        type: "message",
        id: "fx_fixture_message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "Registered the plan.",
            annotations: [],
          },
        ],
      };
  const frames = [
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    },
  ];
  return new Response(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } }
  );
}

async function runElectron(temp: string, fx: string[] = []): Promise<string> {
  const { build } = await import("vite");
  const bundles = [
    ["./browser-host.ts", "browser-host.cjs"],
    ["./browser-automation.ts", "browser-automation.cjs"],
    ["../browser-guest-preload.ts", "browser-guest-preload.js"],
  ];
  if (fx.length)
    bundles.push(
      ["./desktop-browser-tools.ts", "desktop-browser-tools.cjs"],
      ["./fx-viewer.ts", "fx-viewer.cjs"]
    );
  for (const [entry, filename] of bundles) {
    await build({
      configFile: false,
      publicDir: false,
      logLevel: "silent",
      build: {
        target: "esnext",
        outDir: temp,
        emptyOutDir: false,
        lib: {
          entry: fileURLToPath(new URL(entry, import.meta.url)),
          formats: ["cjs"],
          fileName: () => filename,
        },
        rollupOptions: {
          external: [
            "electron",
            ...builtinModules,
            ...builtinModules.map((name) => "node:" + name),
          ],
        },
      },
    });
  }
  const profile = path.join(temp, "profile");
  await fs.mkdir(profile, { mode: 0o700 });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const { stdout } = await execute(
    require("electron") as string,
    [
      fileURLToPath(
        new URL("./browser-automation.electron.cjs", import.meta.url)
      ),
      temp,
      profile,
      ...fx,
    ],
    { env, timeout: 32_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }
  );
  return stdout;
}
