import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaStore } from "@grida/daemon/server";
import type { ThreeDGenerateResult } from "./protocol/three-d";
import { createAgentDaemon, type DaemonServer } from "./server";
import { AgentTransport } from "./transport";

const PASSWORD = "media-test-password";
const ORIGIN = "https://client.example";
const REFERER = `${ORIGIN}/desktop/tools`;
const STATUS_URL = "https://queue.fal.run/requests/one/status";
const RESPONSE_URL = "https://queue.fal.run/requests/one";
const GLB_URL = "https://v3.fal.media/model.glb";
const GLB_BYTES = new Uint8Array([
  0x67,
  0x6c,
  0x54,
  0x46, // magic: glTF
  0x02,
  0x00,
  0x00,
  0x00, // version: 2
  0x0c,
  0x00,
  0x00,
  0x00, // total length: 12 bytes
]);

const cleanup: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("createAgentDaemon media-root forwarding", () => {
  it("forwards the host root through DaemonServices into generation", async () => {
    const base = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-agent-media-daemon-")
    );
    const userData = path.join(base, "agent");
    const mediaRoot = path.join(base, "media");
    const scratchBase = path.join(base, "scratch");
    cleanup.push(() => fs.rm(base, { recursive: true, force: true }));

    const request = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://queue.fal.run/fal-ai/")) {
        return Response.json({
          request_id: "one",
          status_url: STATUS_URL,
          response_url: RESPONSE_URL,
        });
      }
      if (url === STATUS_URL) return Response.json({ status: "COMPLETED" });
      if (url === RESPONSE_URL) {
        return Response.json({
          model_glb: { url: GLB_URL, file_size: GLB_BYTES.byteLength },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const download = vi.fn<typeof globalThis.fetch>(async () => {
      return new Response(GLB_BYTES, {
        headers: {
          "content-type": "model/gltf-binary",
          "content-length": String(GLB_BYTES.byteLength),
        },
      });
    });
    let daemon: DaemonServer | undefined;
    cleanup.push(async () => daemon?.stop());
    daemon = createAgentDaemon({
      password: PASSWORD,
      user_data_path: userData,
      media_root: mediaRoot,
      scratch_base: scratchBase,
      provider_http: { request, download },
      http_access: {
        allowed_origins: [ORIGIN],
        allowed_referer_paths: ["/desktop"],
      },
      capabilities: {
        files: false,
        recent: false,
        workspaces: false,
        agent: false,
        sessions: false,
        providers: false,
        images: false,
        video: false,
        music: false,
        sound_effects: false,
        text_to_speech: false,
        three_d: true,
        secrets: true,
        shell: false,
      },
    });
    await daemon.start({ listen: false });

    const setSecret = await post(daemon, "/secrets/set", {
      provider_id: "fal",
      key: "fal-secret",
    });
    expect(setSecret.status).toBe(200);

    const generated = await post(daemon, "/three-d/generate", {
      model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
      prompt: "a brass robot",
    });
    expect(generated.status).toBe(200);
    const result = (await generated.json()) as ThreeDGenerateResult;
    expect(result.glb.base64).toBe(Buffer.from(GLB_BYTES).toString("base64"));
    expect(result.stored_media).toMatchObject({
      file_name: "model.glb",
      media_type: "model/gltf-binary",
      byte_size: GLB_BYTES.byteLength,
    });

    const stored = await new MediaStore(mediaRoot).read(
      result.stored_media!.id
    );
    expect(stored.bytes).toEqual(GLB_BYTES);
    expect(download).toHaveBeenCalledOnce();
  });
});

function post(daemon: DaemonServer, pathname: string, payload: unknown) {
  return daemon.fetch(
    new Request(`http://127.0.0.1${pathname}`, {
      method: "POST",
      headers: {
        authorization: AgentTransport.buildBasicAuthHeader(PASSWORD),
        origin: ORIGIN,
        referer: REFERER,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  );
}
