import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function chunk(index: number, delta: unknown, finish: string | null = null) {
  return `data: ${JSON.stringify({
    id: `queue-response-${index}`,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

async function provider() {
  const requests: string[] = [];
  const held = new Map<number, ServerResponse>();
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (part: string) => {
      body += part;
    });
    request.on("end", () => {
      requests.push(body);
      const index = requests.length;
      if (request.url !== "/v1/chat/completions" || index > 4) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        chunk(index, { role: "assistant", content: `Fixture reply ${index}` })
      );
      if (index <= 2) held.set(index, response);
      else response.end(chunk(index, {}, "stop") + "data: [DONE]\n\n");
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
    release: (index: number) =>
      held.get(index)?.end(chunk(index, {}, "stop") + "data: [DONE]\n\n"),
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it.runIf(Boolean(packaged))(
  "edits the retained queue and steers the active turn using separate exact bases",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-queue-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider();
    const origin = "https://editor.fixture.invalid";
    const frame = { url: `${origin}/desktop/workspace?id=workspace` };
    const sender = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }) as unknown as WebContents;
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: endpoint.endpoint,
        model: "fixture",
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const { attachmentId } = await ipc.create(event);
      const snapshot = () => ipc.observe(event, attachmentId);
      const page = async () => {
        const basis = await snapshot();
        return ipc.queue(event, attachmentId, basis.observationId, 0);
      };
      const initial = await ipc.submit(
        event,
        attachmentId,
        "active",
        "Initial task."
      );
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
      await ipc.enqueue(event, attachmentId, "a", "Alpha next.");
      await expect(
        ipc.enqueue(event, attachmentId, "b", "Beta next.", "invalid-mode")
      ).rejects.toThrow("native_chat_operating_regime_invalid");
      await ipc.enqueue(event, attachmentId, "b", "Beta next.", "plan");
      await ipc.enqueue(event, attachmentId, "c", "Gamma next.");
      expect((await page()).items).toEqual([
        { inputId: "a", preview: "Alpha next." },
        { inputId: "b", preview: "Beta next.", operatingRegime: "plan" },
        { inputId: "c", preview: "Gamma next." },
      ]);
      const captured = await snapshot();
      await expect(
        ipc.queuedText(event, attachmentId, captured.observationId, "b")
      ).resolves.toBe("Beta next.");
      const replacement = {
        action: "replace",
        inputId: "b",
        text: "Beta revised.",
        observationId: captured.observationId,
        requestId: "replace-beta",
      };
      const replaced = await ipc.editQueue(event, attachmentId, replacement);
      await expect(
        ipc.editQueue(event, attachmentId, replacement)
      ).resolves.toEqual(replaced);
      await expect(
        ipc.editQueue(event, attachmentId, {
          ...replacement,
          text: "Different beta.",
        })
      ).rejects.toThrow("submission_input_changed");
      await expect(
        ipc.editQueue(event, attachmentId, {
          action: "withdraw",
          inputId: "a",
          observationId: captured.observationId,
          requestId: "stale",
        })
      ).rejects.toThrow("stale_session_revision");
      const prior = await ipc.inputReceipt(event, attachmentId, "b");
      expect(prior.disposition).toBe("superseded");
      expect(prior.replacementInputId).toEqual(expect.any(String));
      expect((await page()).items.map((item) => item.preview)).toEqual([
        "Alpha next.",
        "Beta revised.",
        "Gamma next.",
      ]);
      expect((await page()).items[1].operatingRegime).toBe("plan");

      await ipc.editQueue(event, attachmentId, {
        action: "move",
        inputId: "c",
        direction: "up",
        observationId: (await snapshot()).observationId,
        requestId: "move-gamma",
      });
      expect((await page()).items.map((item) => item.inputId)).toEqual([
        "a",
        "c",
        prior.replacementInputId,
      ]);
      await ipc.editQueue(event, attachmentId, {
        action: "withdraw",
        inputId: "a",
        observationId: (await snapshot()).observationId,
        requestId: "remove-alpha",
      });
      expect(
        (await ipc.inputReceipt(event, attachmentId, "a")).disposition
      ).toBe("withdrawn");
      const steering = {
        observationId: (await snapshot()).observationId,
        requestId: "correct-active",
        text: "Correction for the active turn.",
      };
      const corrected = await ipc.steer(event, attachmentId, steering);
      expect(corrected.turnId).toBe(initial.turnId);
      await expect(ipc.steer(event, attachmentId, steering)).resolves.toEqual(
        corrected
      );
      expect((await page()).items.map((item) => item.preview)).toEqual([
        "Gamma next.",
        "Beta revised.",
      ]);
      endpoint.release(1);
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(2));
      expect(endpoint.requests[1]).toContain("Correction for the active turn.");
      expect(endpoint.requests[1]).not.toContain("Gamma next.");
      await ipc.control(event, attachmentId, {
        action: "stop",
        observationId: (await snapshot()).observationId,
        requestId: "stop-active",
      });
      const stopped = await vi.waitFor(async () => {
        const basis = await snapshot();
        expect(basis.snapshot.current).toBeNull();
        expect(basis.snapshot.admissionPaused).toBe(true);
        return basis;
      });
      expect(endpoint.requests).toHaveLength(2);
      await ipc.editQueue(event, attachmentId, {
        action: "resume",
        observationId: stopped.observationId,
        requestId: "resume-queue",
      });
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(4));
      expect(endpoint.requests[2]).not.toContain("Plan is active");
      expect(endpoint.requests[3]).toContain("Plan is active");
      await vi.waitFor(async () => {
        expect((await snapshot()).snapshot.current).toBeNull();
        expect(
          (
            await ipc.inputReceipt(
              event,
              attachmentId,
              prior.replacementInputId!
            )
          ).disposition
        ).toBe("completed");
      });
      expect(endpoint.requests[2]).toContain("Gamma next.");
      expect(endpoint.requests[2]).not.toContain("Beta revised.");
      expect(endpoint.requests[3]).toContain("Beta revised.");
      sender.emit("did-start-navigation", { isMainFrame: true });
      await expect(ipc.steer(event, attachmentId, steering)).rejects.toThrow(
        "native_chat_attachment_unavailable"
      );
    } finally {
      try {
        await chat?.close();
      } finally {
        await endpoint.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  15_000
);
