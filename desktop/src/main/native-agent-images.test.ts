import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { NativeChatImageInput } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
const OTHER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z88AAAMfAQ+5sXHtAAAAAElFTkSuQmCC";
const GRID_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=";

function finish(response: ServerResponse, text: string) {
  finishWith(response, {
    type: "message",
    id: "image-fixture-message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  });
}

function finishWith(response: ServerResponse, item: unknown) {
  const events = [
    {
      type: "response.output_item.done",
      output_index: 0,
      item,
    },
    {
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    },
  ];
  response.end(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
  );
}

async function syntheticResponses(crop = false) {
  const requests: unknown[] = [];
  let previous: ServerResponse | undefined;
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => (body += chunk));
    request.on("end", () => {
      if (
        request.method !== "POST" ||
        request.url !== "/v1/responses" ||
        requests.length >= (crop ? 2 : 3)
      ) {
        response.writeHead(400).end();
        return;
      }
      requests.push(JSON.parse(body));
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (crop && requests.length === 1) {
        finishWith(response, {
          type: "function_call",
          id: "fc_crop_fixture",
          call_id: "call_crop_fixture",
          name: "crop_retained_image",
          arguments: '{"x":1,"y":0,"width":1,"height":2}',
          status: "completed",
        });
      } else if (requests.length === 1) previous = response;
      else finish(response, "The tiny PNG was received.");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    release: () => finish(previous!, "Previous work completed."),
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

function workspaceFrame() {
  const origin = "https://editor.fixture.invalid";
  const frame = { url: `${origin}/desktop/workspace?id=workspace` };
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
  }) as unknown as WebContents;
  return {
    origin,
    sender,
    event: { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent,
  };
}

it.runIf(
  !!resources && (process.platform === "darwin" || process.platform === "linux")
)(
  "queues exact selected PNG bytes through a built Responses child",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-native-png-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const fixture = await syntheticResponses();
    const { origin, sender, event } = workspaceFrame();
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "responses",
        endpoint: fixture.endpoint,
        model: "gpt-5.4",
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      expect(ipc.acceptsPng(event)).toBe(true);
      const { attachmentId } = await ipc.create(event);
      const input: NativeChatImageInput = {
        action: "enqueue",
        inputId: "chosen-png",
        text: "Describe the attached PNG.",
        png: Uint8Array.from(Buffer.from(PNG, "base64")).buffer,
        operatingRegime: "act",
      };
      await expect(
        ipc.submitImage(event, attachmentId, { ...input, text: "" })
      ).rejects.toThrow("native_chat_text_invalid");
      await expect(
        ipc.submitImage(event, attachmentId, {
          ...input,
          path: "/fixture/local.png",
        })
      ).rejects.toThrow("native_chat_invalid_protocol_value");
      await expect(
        ipc.submitImage(event, attachmentId, {
          ...input,
          png: new ArrayBuffer(256 * 1024 + 1),
        })
      ).rejects.toThrow("image_size_limit");
      await expect(
        ipc.submitImage(event, attachmentId, {
          ...input,
          png: new ArrayBuffer(16),
        })
      ).rejects.toThrow("invalid_png_image");
      expect(fixture.requests).toEqual([]);

      await ipc.submit(
        event,
        attachmentId,
        "text-before-image",
        "Start with text."
      );
      await vi.waitFor(() => expect(fixture.requests).toHaveLength(1));
      const accepted = await ipc.submitImage(event, attachmentId, input);
      expect(accepted.disposition).toBe("queued");
      expect(await ipc.submitImage(event, attachmentId, input)).toEqual(
        accepted
      );
      expect(
        await ipc.inputReceipt(event, attachmentId, input.inputId)
      ).toEqual(accepted);
      await expect(
        ipc.submitImage(event, attachmentId, {
          ...input,
          png: Uint8Array.from(Buffer.from(OTHER_PNG, "base64")).buffer,
        })
      ).rejects.toThrow("submission_input_changed");
      const observation = await ipc.observe(event, attachmentId);
      expect(
        (await ipc.queue(event, attachmentId, observation.observationId, 0))
          .items
      ).toEqual([
        expect.objectContaining({ inputId: input.inputId, preview: null }),
      ]);
      await expect(
        ipc.queuedText(
          event,
          attachmentId,
          observation.observationId,
          input.inputId
        )
      ).rejects.toThrow("native_chat_queue_input_unavailable");
      await expect(
        ipc.editQueue(event, attachmentId, {
          action: "replace",
          observationId: observation.observationId,
          requestId: "replace-image-with-text",
          inputId: input.inputId,
          text: "Do not drop the image.",
        })
      ).rejects.toThrow("native_chat_queue_input_unavailable");
      expect(fixture.requests).toHaveLength(1);
      fixture.release();
      await vi.waitFor(
        async () => {
          if (fixture.requests.length !== 2) {
            const observed = await ipc.observe(event, attachmentId);
            throw new Error(
              `Queued PNG provider request not observed: ${JSON.stringify(observed.snapshot)}`
            );
          }
        },
        { timeout: 12_000 }
      );
      expect(JSON.stringify(fixture.requests[0])).not.toContain("input_image");
      expect(JSON.stringify(fixture.requests[1])).toContain(
        `data:image/png;base64,${PNG}`
      );
      await vi.waitFor(async () => {
        const latest = await ipc.observe(event, attachmentId);
        expect(latest.snapshot.latest?.status).toBe("succeeded");
        expect(latest.snapshot.current).toBeNull();
        expect(latest.snapshot.queuedInputs).toBe(0);
      });
      expect(
        JSON.stringify(await ipc.transcript(event, attachmentId))
      ).toContain("[Retained PNG image]");
      const newChat = await ipc.create(event);
      const direct = await ipc.submitImage(event, newChat.attachmentId, {
        ...input,
        action: "submit",
        png: Uint8Array.from(Buffer.from(OTHER_PNG, "base64")).buffer,
      });
      expect(direct.disposition).toBe("claimed");
      await vi.waitFor(() => expect(fixture.requests).toHaveLength(3));
      expect(JSON.stringify(fixture.requests[2])).toContain(
        `data:image/png;base64,${OTHER_PNG}`
      );
      await vi.waitFor(async () => {
        expect(
          (await ipc.observe(event, newChat.attachmentId)).snapshot.latest
        ).toMatchObject({ turnId: direct.turnId, status: "succeeded" });
      });
    } finally {
      try {
        await chat?.close();
      } finally {
        await fixture.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  25_000
);

it.runIf(
  !!resources && (process.platform === "darwin" || process.platform === "linux")
)(
  "opens the exact completed crop through Desktop after restarting the native child",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-native-artifact-")
    );
    const cwd = path.join(root, "workspace");
    const stateDirectory = path.join(root, "state");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const fixture = await syntheticResponses(true);
    const open = () =>
      NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory,
        cwd,
        provider: "responses",
        endpoint: fixture.endpoint,
        model: "gpt-5.4",
      });
    const { origin, sender, event } = workspaceFrame();
    let chat: NativeAgentChat | undefined;
    const ipc = new NativeChatIpc(origin, (candidate) =>
      candidate === sender && chat ? { workspaceId: "workspace", chat } : null
    );
    try {
      chat = await open();
      const opened = await ipc.create(event);
      const accepted = await ipc.submitImage(event, opened.attachmentId, {
        action: "submit",
        inputId: "crop-the-grid",
        text: "Crop the right half.",
        png: Uint8Array.from(Buffer.from(GRID_PNG, "base64")).buffer,
        operatingRegime: "act",
      });
      await vi.waitFor(
        async () => {
          expect(fixture.requests).toHaveLength(2);
          const { snapshot } = await ipc.observe(event, opened.attachmentId);
          expect(snapshot.latest).toMatchObject({
            turnId: accepted.turnId,
            status: "succeeded",
          });
          expect(snapshot.current).toBeNull();
        },
        { timeout: 12_000 }
      );
      expect(fixture.requests).toHaveLength(2);
      expect(JSON.stringify(fixture.requests[0])).toContain(
        "crop_retained_image"
      );
      expect(JSON.stringify(fixture.requests[1])).toContain(
        "Saved cropped PNG"
      );
      await ipc.detach(event, opened.attachmentId);
      await chat.close();
      chat = await open();

      const reopened = await ipc.load(event, opened.sessionId);
      const { observationId } = await ipc.observe(event, reopened.attachmentId);
      const result = await ipc.turnSummary(
        event,
        reopened.attachmentId,
        observationId
      );
      expect(result.artifacts).toEqual([
        {
          id: expect.any(String),
          kind: "image",
          mimeType: "image/png",
          label: "Cropped PNG",
          width: 1,
          height: 2,
          bytes: expect.any(Number),
        },
      ]);
      const crop = result.artifacts![0];
      const bytes = await ipc.readArtifact(
        event,
        reopened.attachmentId,
        observationId,
        crop.id
      );
      const scopes = path.join(stateDirectory, "retained-inputs");
      const work = path.join(scopes, fs.readdirSync(scopes)[0], "work");
      const saved = path.join(work, fs.readdirSync(work)[0]);
      expect(Buffer.from(bytes)).toEqual(fs.readFileSync(saved));
      expect(fs.readdirSync(cwd)).toEqual([]);
      fs.unlinkSync(saved);
      await expect(
        ipc.readArtifact(event, reopened.attachmentId, observationId, crop.id)
      ).rejects.toThrow("artifact_unavailable");
      expect(fixture.requests).toHaveLength(2);
    } finally {
      try {
        await chat?.close();
      } finally {
        await fixture.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  25_000
);
