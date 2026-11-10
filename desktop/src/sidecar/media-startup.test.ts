// GRIDA-SEC-014 — real shared-file custody with isolated native migration locks.
// GRIDA-SEC-004 / GRIDA-SEC-006 — real sidecar startup, private channels and synthetic custody.
// GRIDA-GG: provider — fake scoped grants only; no issuer or provider is contacted.
import { spawn, type ChildProcess } from "node:child_process";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// Only the Electron fetch adapter is replaced. The real host validates grants
// and carries requests/responses over the same bounded channel as Desktop.
vi.mock("electron", () => ({ net: {}, session: {} }));
import { AgentNetworkHost } from "../main/agent-network-host";
import { AgentNetworkAuthority } from "../main/agent-network-authority";
import { AgentDaemonSocketHost } from "../main/agent-daemon-socket-host";
import { LegacyChatArchive } from "../main/legacy-chat-archive";
import { LegacyChatSourceLease } from "../main/legacy-chat-source-lease";
import { DesktopMediaHost } from "../main/media-host";
import { RetainedMediaLaunch } from "../main/retained-media-launch";

const desktop = fileURLToPath(new URL("../..", import.meta.url));
const fixture = fileURLToPath(new URL("./testing/", import.meta.url));
const requireDesktop = createRequire(path.join(desktop, "package.json"));
// Runtime-load the shared test-only builder: Desktop has its own TypeScript
// root, and the helper is deliberately not a shipped SDK export.
const { ggContractFixture } = requireDesktop(
  "../packages/grida-ai/src/testing/gg-contract.ts"
) as {
  ggContractFixture(entries: { id: string; kind: "music" }[]): {
    response(url: string): Response | undefined;
  };
};
const origin = "https://example.invalid";
const password = "synthetic-desktop-media-password-123456789";
const key = "synthetic-elevenlabs-key";
const ggToken = "synthetic-scoped-gg-token";
const audio = Buffer.from([0x49, 0x44, 0x33, 0x04]);

const packagedExecutable = process.env.GRIDA_TEST_RETAINED_MEDIA_EXECUTABLE;

describe.skipIf(
  process.platform !== "darwin" ||
    process.arch !== "arm64" ||
    !packagedExecutable
)("packaged retained media confinement", () => {
  it("refuses overlapping, missing, aliased, or public authority roots", async () => {
    const scope = await packagedScope();
    try {
      const { settings, temporary } = scope.options;
      expect(() =>
        RetainedMediaLaunch.prepare({ ...scope.options, media: settings })
      ).toThrow("retained_media_scope_overlap");
      expect(() =>
        RetainedMediaLaunch.prepare({
          ...scope.options,
          media: path.join(scope.root, "missing"),
        })
      ).toThrow("retained_media_path_invalid");
      const alias = path.join(scope.root, "alias");
      await fs.symlink(temporary, alias);
      expect(() =>
        RetainedMediaLaunch.prepare({ ...scope.options, temporary: alias })
      ).toThrow("retained_media_path_invalid");
      await fs.chmod(temporary, 0o755);
      expect(() => RetainedMediaLaunch.prepare(scope.options)).toThrow(
        "retained_media_directory_invalid"
      );
    } finally {
      await fs.rm(scope.root, { recursive: true, force: true });
    }
  });

  it("serves media over private handles and retries export after sidecar shutdown", async () => {
    const scope = await packagedScope();
    let active: Sidecar | undefined;
    try {
      let providerRequests = 0;
      active = await Sidecar.startRetained(scope.options, async (url, init) => {
        expect(url).toBe(
          "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
        );
        expect(new Headers(init.headers).get("xi-api-key")).toBe(key);
        providerRequests++;
        return new Response(audio, {
          headers: { "content-type": "audio/mpeg" },
        });
      });
      const handshake = await active.post("/handshake");
      expect(handshake.status).toBe(200);
      expect((await handshake.json()).capabilities).toMatchObject({
        files: false,
        recent: false,
        workspaces: false,
        agent: false,
        sessions: false,
        shell: false,
        providers: true,
        sound_effects: true,
      });
      for (const route of [
        "/workspaces/list",
        "/files/register",
        "/recent/list",
        "/agent/run",
      ]) {
        expect((await active.post(route)).status).toBe(404);
      }
      const config = {
        id: "local_fixture",
        base_url: "http://127.0.0.1:11434/v1",
        models: [{ id: "fixture-model" }],
      };
      expect(
        (await active.post("/providers/endpoints/set", { config })).status
      ).toBe(200);
      expect(
        await (await active.post("/providers/endpoints/list")).json()
      ).toEqual([config]);
      expect(
        (
          await active.post("/secrets/set", {
            provider_id: "elevenlabs",
            key,
          })
        ).status
      ).toBe(200);
      const sfx = await active.post("/audio/sound-effects/generate", {
        model_id: "eleven_text_to_sound_v2",
        prompt: "A door closes",
      });
      expect(sfx.status).toBe(200);
      const generated = await sfx.json();
      await expectReceipt(scope.options.media, generated.stored_media);
      expect(providerRequests).toBe(1);
      await active.stop();
      active = undefined;
      await expectExportRetry(
        scope.root,
        scope.options.media,
        generated.stored_media
      );
      expect(providerRequests).toBe(1);
      expect(
        JSON.parse(
          await fs.readFile(
            path.join(scope.options.settings, "endpoints.json"),
            "utf8"
          )
        )
      ).toEqual([config]);
    } finally {
      await active?.stop(false);
      await fs.rm(scope.root, { recursive: true, force: true });
    }
  });

  it("denies direct network and out-of-scope files under the same kernel profile", async () => {
    const scope = await packagedScope();
    const listener = net.createServer();
    let child: ChildProcess | undefined;
    let exited: Promise<number | null> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1", resolve);
      });
      let accepted = 0;
      listener.on("connection", (socket) => {
        accepted++;
        socket.destroy();
      });
      const address = listener.address();
      assert(address && typeof address !== "string");
      const outside = path.join(scope.root, "outside.txt");
      const probe = path.join(scope.options.temporary, "probe.cjs");
      await fs.writeFile(outside, "outside the retained scope");
      await fs.symlink(outside, path.join(scope.options.temporary, "alias"));
      await fs.writeFile(
        probe,
        `
          const { spawnSync } = require("node:child_process");
          const fs = require("node:fs");
          const net = require("node:net");
          const result = (action) => {
            try { action(); return "allowed"; } catch (error) { return error.code; }
          };
          const events = (socket, event) => new Promise((resolve) => {
            socket.once("error", (error) => resolve(error.code));
            socket.once(event, () => { resolve("allowed"); socket.close?.(); socket.destroy?.(); });
          });
          const outbound = net.connect(Number(process.argv[3]), "127.0.0.1");
          const inbound = net.createServer().listen(0, "127.0.0.1");
          Promise.all([events(outbound, "connect"), events(inbound, "listening")]).then(([connect, listen]) => {
            const data = {
              connect,
              listen,
              read: result(() => fs.readFileSync(process.argv[2])),
              alias: result(() => fs.readFileSync("alias")),
              write: result(() => fs.writeFileSync(process.argv[2], "modified")),
              exec: spawnSync("/bin/sh", ["-c", "exit 0"]).error?.code ?? "allowed",
              own: result(() => fs.writeFileSync("own", "yes")),
            };
            process.send(data, () => process.exit(0));
          });
        `
      );
      const plan = RetainedMediaLaunch.prepare(scope.options);
      child = spawn(
        "/usr/bin/sandbox-exec",
        [
          ...plan.sandboxArgs,
          plan.executable,
          probe,
          outside,
          String(address.port),
        ],
        {
          cwd: plan.cwd,
          env: plan.env,
          stdio: ["pipe", "pipe", "pipe", "ipc"],
        }
      );
      let diagnostics = "";
      child.stderr!.on("data", (chunk) => {
        diagnostics = (diagnostics + String(chunk)).slice(-4096);
      });
      exited = new Promise((resolve) => child!.once("close", resolve));
      deadline = setTimeout(() => child?.kill("SIGKILL"), 5000);
      const result = await new Promise<Record<string, string>>(
        (resolve, reject) => {
          child!.once("message", (message) =>
            resolve(message as Record<string, string>)
          );
          child!.once("error", reject);
          child!.once("close", (status) =>
            reject(new Error(`probe exited ${status}: ${diagnostics}`))
          );
        }
      );
      expect(result.own).toBe("allowed");
      for (const operation of [
        "connect",
        "listen",
        "read",
        "alias",
        "write",
        "exec",
      ]) {
        assert.match(result[operation], /^(?:EACCES|EPERM)$/, operation);
      }
      expect(accepted).toBe(0);
      expect(await exited).toBe(0);
      expect(await fs.readFile(outside, "utf8")).toBe(
        "outside the retained scope"
      );
    } finally {
      clearTimeout(deadline);
      if (child?.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
      listener.close();
      await fs.rm(scope.root, { recursive: true, force: true });
    }
  });
});

async function packagedScope() {
  assert(packagedExecutable);
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-retained-media-"))
  );
  const options = {
    executable: packagedExecutable,
    settings: path.join(root, "settings"),
    providerHome: path.join(root, "custody"),
    media: path.join(root, "media"),
    temporary: path.join(root, "temporary"),
    editorBaseUrl: origin,
  };
  for (const directory of [
    options.settings,
    options.providerHome,
    path.join(options.providerHome, "providers"),
    options.media,
    options.temporary,
  ]) {
    await fs.mkdir(directory, { mode: 0o700 });
  }
  return { root, options };
}

describe("built Desktop media startup", () => {
  it("serves media through real private channels without agent startup or ambient networking", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-media-startup-")
    );
    const userData = path.join(root, "state");
    const mediaRoot = path.join(root, "media");
    const output = path.join(root, "build");
    const home = path.join(root, "home");
    const temporary = path.join(root, "tmp");
    let active: Sidecar | undefined;
    try {
      for (const directory of [userData, mediaRoot, home, temporary]) {
        await fs.mkdir(directory, { mode: 0o700 });
      }
      const env = {
        HOME: home,
        USERPROFILE: home,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
      };
      await runBuild(root, output, env);
      // Vite intentionally leaves the existing Hono/undici runtime dependencies
      // external. This is a startup proof, not an independent distribution proof.
      await fs.symlink(
        path.join(desktop, "node_modules"),
        path.join(root, "node_modules"),
        "dir"
      );
      const runtime = await sidecarRuntime();
      const verified: string[] = [];
      const network: {
        url: string;
        method: string | undefined;
        authorization: string | null;
        cookie: string | null;
        apiKey: string | null;
      }[] = [];
      const metadata = ggContractFixture([
        { id: "google/lyria-3", kind: "music" },
      ]);
      const fetchProvider = async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        network.push({
          url,
          method: init.method,
          authorization: headers.get("authorization"),
          cookie: headers.get("cookie"),
          apiKey: headers.get("xi-api-key"),
        });
        const discovery = metadata.response(url);
        if (discovery) return discovery;
        if (url === "https://fal.media/music.mp3") {
          return new Response(audio, {
            headers: { "content-type": "audio/mpeg" },
          });
        }
        if (url === `${origin}/api/v1/ai/jobs?request_id=req_music`) {
          return Response.json({
            id: "req_music",
            request_id: "req_music",
            model: "google/lyria-3",
            status: "succeeded",
            result_status: "available",
            result: {
              audio: {
                url: "https://fal.media/music.mp3",
                media_type: "audio/mpeg",
              },
            },
          });
        }
        expect(init.method).toBe("POST");
        expect(headers.has("cookie")).toBe(false);
        const body = JSON.parse(await new Response(init.body).text());
        if (
          url ===
          "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
        ) {
          assert.equal(headers.get("xi-api-key"), key);
          assert.equal(headers.has("authorization"), false);
          assert.deepEqual(body, {
            text: "A door closes",
            model_id: "eleven_text_to_sound_v2",
          });
          verified.push("sfx");
          return new Response(audio, {
            headers: { "content-type": "audio/mpeg" },
          });
        }
        expect(url).toBe(`${origin}/api/v1/ai/operations`);
        expect(headers.get("authorization")).toBe(`Bearer ${ggToken}`);
        expect(headers.has("xi-api-key")).toBe(false);
        expect(body).toEqual({
          operation_id: "music.google.lyria-3.generate",
          input: { prompt: "A piano phrase" },
        });
        verified.push("music");
        return Response.json(
          {
            id: "req_music",
            request_id: "req_music",
            status: "pending",
            result_status: "pending",
            result: null,
          },
          { status: 202 }
        );
      };

      active = await Sidecar.start({
        root,
        output,
        userData,
        mediaRoot,
        env,
        runtime,
        fetchProvider,
        generation: 1,
      });
      const handshake = await active.post("/handshake");
      expect(handshake.status).toBe(200);
      expect(await handshake.json()).toEqual(
        expect.objectContaining({
          capabilities: expect.objectContaining({
            agent: false,
            sessions: false,
            providers: false,
            secrets: true,
            images: true,
            video: true,
            three_d: true,
            music: true,
            sound_effects: true,
            text_to_speech: true,
            gg: true,
            shell: false,
          }),
        })
      );
      expect(
        (
          await active.post(
            "/handshake",
            {},
            { authorization: "Basic invalid" }
          )
        ).status
      ).toBe(401);
      expect(
        (await active.post("/handshake", {}, { referer: `${origin}/blog` }))
          .status
      ).toBe(403);
      expect((await active.post("/providers/claude/detect")).status).toBe(404);
      expect((await active.get("/sessions")).status).toBe(404);
      expect((await active.post("/agent/run")).status).toBe(404);
      expect(
        (await active.post("/secrets/get", { provider_id: "elevenlabs" }))
          .status
      ).toBe(404);
      // Only after a successful media-only handshake may shared custody import
      // SQLite's lock-only adapter. Chat startup remains forbidden throughout.
      await fs.writeFile(path.join(root, "allow-custody"), "enabled", {
        mode: 0o600,
      });
      expect(
        (await active.post("/secrets/set", { provider_id: "elevenlabs", key }))
          .status
      ).toBe(200);
      const sfx = await active.post("/audio/sound-effects/generate", {
        model_id: "eleven_text_to_sound_v2",
        prompt: "A door closes",
      });
      expect(sfx.status).toBe(200);
      const generated = await sfx.json();
      expect(generated.audio).toEqual({
        base64: audio.toString("base64"),
        media_type: "audio/mpeg",
        file_name: "sound-effect.mp3",
      });
      expect(generated.stored_media).toEqual(
        expect.objectContaining({
          file_name: "sound-effect.mp3",
          media_type: "audio/mpeg",
          byte_size: audio.length,
        })
      );
      await expectReceipt(mediaRoot, generated.stored_media);
      await expectExportRetry(root, mediaRoot, generated.stored_media);
      expect(verified).toEqual(["sfx"]);
      expect(
        (
          await active.post("/auth/gg/set", {
            access_token: ggToken,
            expires_at: Date.now() + 120_000,
          })
        ).status
      ).toBe(200);
      expect(
        JSON.stringify(await (await active.post("/auth/gg/status")).json())
      ).not.toContain(ggToken);
      const music = await active.post("/audio/music/generate", {
        model_id: "google/lyria-3",
        prompt: "A piano phrase",
      });
      expect(music.status).toBe(200);
      await expectReceipt(mediaRoot, (await music.json()).stored_media);
      expect(verified).toEqual(["sfx", "music"]);
      // Assert the complete observed flow, so no conditional branch can silently
      // skip its authority proof. Discovery and downloads have no credentials.
      const anonymous = {
        method: "GET",
        authorization: null,
        cookie: null,
        apiKey: null,
      };
      const scoped = {
        authorization: `Bearer ${ggToken}`,
        cookie: null,
        apiKey: null,
      };
      expect(network.toSorted((a, b) => a.url.localeCompare(b.url))).toEqual(
        [
          ...["/v1/models", "/v1/endpoints", "/schemas/operations.json"].map(
            (path) => ({ url: `https://gateway.grida.ai${path}`, ...anonymous })
          ),
          { url: "https://fal.media/music.mp3", ...anonymous },
          {
            url: `${origin}/api/v1/ai/jobs?request_id=req_music`,
            method: "GET",
            ...scoped,
          },
          { url: `${origin}/api/v1/ai/operations`, method: "POST", ...scoped },
          {
            url: "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
            method: "POST",
            authorization: null,
            cookie: null,
            apiKey: key,
          },
        ].toSorted((a, b) => a.url.localeCompare(b.url))
      );

      expect((await active.post("/auth/gg/clear")).status).toBe(200);
      expect(
        (
          await active.post("/audio/music/generate", {
            model_id: "google/lyria-3",
            prompt: "A piano phrase",
          })
        ).status
      ).toBe(401);
      expect(verified).toEqual(["sfx", "music"]);
      // Leave a grant in memory to distinguish restart cleanup from explicit clear.
      expect(
        (
          await active.post("/auth/gg/set", {
            access_token: ggToken,
            expires_at: Date.now() + 120_000,
          })
        ).status
      ).toBe(200);
      await active.stop();
      active = undefined;

      expect((await fs.readdir(userData)).sort()).toEqual([
        ".auth-lock",
        "providers",
      ]);
      expect(await fs.readdir(temporary)).toEqual([]);
      expect(await fs.readdir(home)).toEqual([]);
      const state = await fs.readFile(
        path.join(userData, "providers", "credentials.toml"),
        "utf8"
      );
      expect(state).toContain(key);
      expect(state).not.toContain(ggToken);
      active = await Sidecar.start({
        root,
        output,
        userData,
        mediaRoot,
        env,
        runtime,
        fetchProvider,
        generation: 2,
        nativeChat: true,
      });
      const retained = await active.post("/handshake");
      expect(retained.status).toBe(200);
      expect((await retained.json()).capabilities).toMatchObject({
        recent: false,
        agent: false,
        sessions: false,
        providers: true,
        shell: false,
      });
      expect((await active.post("/recent/list")).status).toBe(404);
      await fs.writeFile(path.join(root, "allow-custody"), "enabled", {
        mode: 0o600,
      });
      const config = {
        id: "local_fixture",
        base_url: "http://127.0.0.1:11434/v1",
        models: [{ id: "fixture-model" }],
      };
      expect(
        (await active.post("/providers/endpoints/set", { config })).status
      ).toBe(200);
      expect(
        await (await active.post("/providers/endpoints/list")).json()
      ).toEqual([config]);
      expect(
        await (
          await active.post("/secrets/has", { provider_id: config.id })
        ).json()
      ).toEqual({ has: false });
      expect((await active.get("/sessions")).status).toBe(404);
      expect((await active.post("/agent/run")).status).toBe(404);
      expect(
        await (
          await active.post("/secrets/has", { provider_id: "elevenlabs" })
        ).json()
      ).toEqual({ has: true });
      expect(await (await active.post("/auth/gg/status")).json()).toEqual({
        active: false,
      });
      expect(
        (
          await active.post("/audio/music/generate", {
            model_id: "google/lyria-3",
            prompt: "A piano phrase",
          })
        ).status
      ).toBe(401);
      expect(verified).toEqual(["sfx", "music"]);
      // The generated bytes still reach the open preview when the managed
      // library cannot publish a receipt. Preserve earlier retained entries.
      const items = path.join(mediaRoot, "items");
      const parked = path.join(mediaRoot, "retained-items");
      await fs.rename(items, parked);
      try {
        await fs.writeFile(items, "occupied library location", { mode: 0o600 });
        const response = await active.post("/audio/sound-effects/generate", {
          model_id: "eleven_text_to_sound_v2",
          prompt: "A door closes",
        });
        expect(response.status).toBe(200);
        const live = await response.json();
        expect(live.audio).toEqual(generated.audio);
        expect(live).not.toHaveProperty("stored_media");
        expect(await fs.readFile(items, "utf8")).toBe(
          "occupied library location"
        );
      } finally {
        await fs.rm(items, { force: true });
        await fs.rename(parked, items);
      }
      expect(verified).toEqual(["sfx", "music", "sfx"]);
      await expectReceipt(mediaRoot, generated.stored_media);
      await active.stop();
      active = undefined;
      for (const generation of [1, 2]) {
        const report = JSON.parse(
          await fs.readFile(path.join(root, `guard-${generation}.json`), "utf8")
        );
        expect(report.counts).toEqual({ imports: 0, network: 0, processes: 0 });
        expect(report.custody.locks).toBeGreaterThan(0);
        expect(Number(report.node.split(".")[0])).toBeGreaterThanOrEqual(24);
        expect(Boolean(report.electron)).toBe(runtime.electron);
      }
    } finally {
      try {
        await active?.stop();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  }, 120_000);

  it.skipIf(process.platform === "win32")(
    "joins a real legacy database writer before retiring its isolated source",
    async () => {
      const root = await fs.mkdtemp(
        path.join(await fs.realpath(os.tmpdir()), "grida-legacy-writer-")
      );
      const userData = path.join(root, "state");
      const mediaRoot = path.join(root, "media");
      const output = path.join(root, "build");
      const home = path.join(root, "home");
      const temporary = path.join(root, "tmp");
      const scratchBase = path.join(root, "scratch");
      let active: Sidecar | undefined;
      try {
        for (const directory of [
          userData,
          mediaRoot,
          home,
          temporary,
          scratchBase,
        ])
          await fs.mkdir(directory, { mode: 0o700 });
        const env = {
          HOME: home,
          USERPROFILE: home,
          TMPDIR: temporary,
          TMP: temporary,
          TEMP: temporary,
        };
        await runBuild(root, output, env);
        await fs.symlink(
          path.join(desktop, "node_modules"),
          path.join(root, "node_modules"),
          "dir"
        );
        const source = { userDataPath: userData, scratchBase };
        const lease = new LegacyChatSourceLease(source);
        const writer = await lease.claimWriter();
        const metadata = ggContractFixture([]);
        active = await Sidecar.start({
          root,
          output,
          userData,
          mediaRoot,
          env,
          runtime: await sidecarRuntime(),
          generation: 1,
          fetchProvider: async (url) =>
            metadata.response(url) ?? new Response(null, { status: 403 }),
          legacyScratch: scratchBase,
        });
        const handshake = await active.post("/handshake");
        expect((await handshake.json()).capabilities).toMatchObject({
          agent: true,
          sessions: true,
          shell: false,
        });
        const created = await active.post("/sessions", {
          agent: "fixture",
          title: "Saved legacy chat",
        });
        expect(created.status).toBe(200);
        await expect(lease.claimWriter()).rejects.toThrow(
          "legacy_chat_source_dirty"
        );
        const owned = active;
        await writer.completeDrain(async (claimId) => {
          if (claimId !== writer.claimId) return false;
          await owned.stop();
          return true;
        });
        active = undefined;
        const archive = new LegacyChatArchive(source);
        const retired = await lease.retire({
          requestId: "fixture-retirement",
          verifyWriterAdmission: async () => true,
          verifyArchive: async () => {
            const captured = await archive.snapshotQuiesced();
            return captured ? (await archive.verify(captured.id)).id : null;
          },
        });
        expect(retired.archiveId).toMatch(/^[a-f0-9]{64}$/);
        expect(await archive.verify(retired.archiveId!)).toMatchObject({
          sessionCount: 1,
        });
        await expect(lease.claimWriter()).rejects.toThrow(
          "legacy_chat_source_retired"
        );
      } finally {
        try {
          await active?.stop(false);
        } finally {
          await fs.rm(root, { recursive: true, force: true });
        }
      }
    },
    120_000
  );
});

type StartOptions = {
  root: string;
  output: string;
  userData: string;
  mediaRoot: string;
  env: NodeJS.ProcessEnv;
  runtime: { executable: string; electron: boolean };
  fetchProvider: (url: string, init: RequestInit) => Promise<Response>;
  generation: number;
  nativeChat?: boolean;
  legacyScratch?: string;
};

class Sidecar {
  private readonly errors: Error[] = [];
  private readonly network: AgentNetworkHost;
  private readonly sockets: AgentDaemonSocketHost;
  private readonly exit: Promise<{
    code: number | null;
    signal: string | null;
  }>;
  private stderr = "";
  private stopped = false;
  private port = 0;
  private constructor(
    private readonly child: ChildProcess,
    fetchProvider: StartOptions["fetchProvider"],
    private readonly legacy: boolean
  ) {
    this.exit = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    void this.exit.catch(() => undefined);
    child.stderr!.on("data", (chunk) => {
      this.stderr = (this.stderr + String(chunk)).slice(-64 * 1024);
    });
    const fatal = (error: Error) => this.errors.push(error);
    this.network = new AgentNetworkHost(
      child.stdout!,
      child.stdin!,
      new AgentNetworkAuthority(origin),
      { fetch: fetchProvider },
      fatal
    );
    this.sockets = new AgentDaemonSocketHost(child, fatal);
  }
  static async start(options: StartOptions): Promise<Sidecar> {
    await fs.rm(path.join(options.root, "allow-custody"), { force: true });
    const child = spawn(
      options.runtime.executable,
      [
        ...(options.legacyScratch
          ? []
          : ["--require", path.join(fixture, "media-startup-guard.cjs")]),
        path.join(options.output, "sidecar.cjs"),
        ...(options.legacyScratch
          ? [
              "--agent=enabled",
              `--scratch-base=${options.legacyScratch}`,
              `--skills-root=${options.legacyScratch}`,
            ]
          : [options.nativeChat ? "--agent=native-chat" : "--agent=disabled"]),
        `--user-data=${options.userData}`,
        `--media-root=${options.mediaRoot}`,
        `--editor-base-url=${origin}`,
      ],
      {
        cwd: options.root,
        env: {
          ...options.env,
          ELECTRON_RUN_AS_NODE: "1",
          GRIDA_MEDIA_STARTUP_ROOT: options.root,
          GRIDA_MEDIA_STARTUP_STATE: options.userData,
          GRIDA_MEDIA_STARTUP_REPORT: path.join(
            options.root,
            `guard-${options.generation}.json`
          ),
        },
        stdio: ["pipe", "pipe", "pipe", "ipc"],
      }
    );
    return await Sidecar.initialize(
      child,
      options.fetchProvider,
      options.legacyScratch !== undefined
    );
  }
  static async startRetained(
    options: RetainedMediaLaunch.Options,
    fetchProvider: StartOptions["fetchProvider"]
  ): Promise<Sidecar> {
    return await Sidecar.initialize(
      RetainedMediaLaunch.start(options),
      fetchProvider,
      false
    );
  }
  private static async initialize(
    child: ChildProcess,
    fetchProvider: StartOptions["fetchProvider"],
    legacy: boolean
  ) {
    const sidecar = new Sidecar(child, fetchProvider, legacy);
    let startupTimer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      startupTimer = setTimeout(
        () => reject(new Error("complete sidecar startup timed out")),
        15_000
      );
    });
    try {
      await Promise.race([
        (async () => {
          sidecar.port = await sidecar.sockets.listen();
          const ready = sidecar.network.waitForReady();
          await sidecar.network.bootstrap(password, sidecar.port);
          await Promise.all([ready, sidecar.sockets.waitForCapabilityReady()]);
          sidecar.sockets.markReady(sidecar.port);
        })(),
        deadline,
        sidecar.exit.then(() => {
          throw new Error("sidecar exited before readiness");
        }),
      ]);
      return sidecar;
    } catch (error) {
      await sidecar.stop(false);
      const diagnostic = sidecar.stderr
        .replaceAll(key, "[redacted]")
        .replaceAll(ggToken, "[redacted]")
        .replaceAll(password, "[redacted]");
      throw new Error(`sidecar startup failed: ${diagnostic}`, {
        cause: error,
      });
    } finally {
      clearTimeout(startupTimer!);
    }
  }
  post(
    route: string,
    body: unknown = {},
    override: Record<string, string> = {}
  ) {
    return this.request("POST", route, body, override);
  }
  get(route: string) {
    return this.request("GET", route);
  }
  private request(
    method: "GET" | "POST",
    route: string,
    body?: unknown,
    override: Record<string, string> = {}
  ) {
    return fetch(`http://127.0.0.1:${this.port}${route}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`agent:${password}`).toString("base64")}`,
        origin,
        referer: `${origin}/desktop/tools`,
        "content-type": "application/json",
        ...override,
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
  }
  async stop(assertClean = true): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.sockets.close();
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 10_000);
    try {
      if (assertClean) await this.network.requestDrain();
      else {
        this.network.close();
        this.child.kill("SIGTERM");
      }
      const status = await this.exit;
      if (assertClean) {
        assert.deepEqual(status, { code: 0, signal: null });
        assert.deepEqual(this.errors, []);
        assert.equal(this.stderr.includes(key), false);
        assert.equal(this.stderr.includes(ggToken), false);
        if (!this.legacy)
          assert.doesNotMatch(
            this.stderr,
            /SQLite|scratch|skills-root|forbidden imports|forbidden network/
          );
      }
    } catch (error) {
      this.network.close();
      this.child.kill("SIGTERM");
      await this.exit;
      throw error;
    } finally {
      this.network.close();
      clearTimeout(timer);
    }
  }
}

async function runBuild(root: string, output: string, env: NodeJS.ProcessEnv) {
  const child = spawn(
    process.execPath,
    [path.join(fixture, "media-startup-build.mjs"), desktop, output],
    { cwd: root, env, stdio: "ignore" }
  );
  const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    assert.equal(code, 0, "actual sidecar Vite build");
  } finally {
    clearTimeout(timer);
  }
}

async function sidecarRuntime() {
  const electronRoot = path.dirname(
    requireDesktop.resolve("electron/package.json")
  );
  try {
    const executable = path.join(
      electronRoot,
      "dist",
      (await fs.readFile(path.join(electronRoot, "path.txt"), "utf8")).trim()
    );
    await fs.access(executable);
    return { executable, electron: true };
  } catch {
    // CI without a downloaded Electron binary still proves Node startup. The
    // report records that distinction; it must not be called Electron proof.
    assert.ok(Number(process.versions.node.split(".")[0]) >= 24);
    return { executable: process.execPath, electron: false };
  }
}

async function expectReceipt(
  root: string,
  item: { id: string; file_name: string }
) {
  expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(["sound-effect.mp3", "lyria-3.mp3"]).toContain(item.file_name);
  const bytes = await fs.readFile(
    path.join(root, "items", item.id, "content", item.file_name)
  );
  expect(bytes).toEqual(audio);
}

async function expectExportRetry(
  root: string,
  mediaRoot: string,
  item: { id: string; file_name: string }
) {
  const occupied = path.join(root, "occupied.mp3");
  const destination = path.join(root, "saved.mp3");
  const sentinel = Buffer.from("existing user file");
  await fs.writeFile(occupied, sentinel, { mode: 0o600 });

  const openMedia = () =>
    new DesktopMediaHost({
      root: mediaRoot,
      reveal: () => undefined,
      openFolder: () => undefined,
    });
  const requireCurrent = () => undefined;
  type ChooseDestination = Parameters<DesktopMediaHost["saveCopy"]>[1];
  const chooseOccupied = vi.fn<ChooseDestination>().mockResolvedValue(occupied);
  await expect(
    openMedia().saveCopy(item.id, chooseOccupied, requireCurrent)
  ).resolves.toBe("failed");
  expect(chooseOccupied).toHaveBeenCalledExactlyOnceWith(
    "sound-effect.mp3",
    ".mp3"
  );
  expect(await fs.readFile(occupied)).toEqual(sentinel);

  const reopened = openMedia();
  await expect(reopened.list()).resolves.toContainEqual(item);
  const chooseDestination = vi
    .fn<ChooseDestination>()
    .mockResolvedValue(destination);
  await expect(
    reopened.saveCopy(item.id, chooseDestination, requireCurrent)
  ).resolves.toBe("saved");
  expect(chooseDestination).toHaveBeenCalledExactlyOnceWith(
    "sound-effect.mp3",
    ".mp3"
  );
  expect(await fs.readFile(destination)).toEqual(audio);
  expect(await fs.readFile(occupied)).toEqual(sentinel);
}
