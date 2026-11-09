import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { NativeChatStreamUpdate } from "@grida/desktop-bridge";
import {
  NativeAgentChat,
  type NativeAgentChatLaunch,
} from "./native-agent-chat";

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function fixture() {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-native-chat-")
  );
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { mode: 0o700 });
  return {
    root,
    cwd,
    stateDirectory: path.join(root, "state"),
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function heldProvider() {
  const prompts: string[] = [];
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      prompts.push(body);
      if (
        request.method !== "POST" ||
        request.url !== "/v1/chat/completions" ||
        prompts.length > 2
      ) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({
          id: `fixture-${prompts.length}`,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "Working" },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    prompts,
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it("rejects a chat launch outside the main-selected workspace", async () => {
  const test = fixture();
  try {
    await expect(
      NativeAgentChat.start({
        resourcesPath: test.root,
        stateDirectory: test.stateDirectory,
        cwd: test.root,
        endpoint: "http://127.0.0.1:1/v1",
        provider: "openai-compatible",
        model: "fixture",
        workspace: {
          id: "workspace",
          primary: { id: "primary", name: "Primary", path: test.cwd },
          additionalReadRoots: [],
          protectedPaths: [],
        },
      })
    ).rejects.toThrow("native_chat_workspace_invalid");
  } finally {
    test.close();
  }
});

it.runIf(Boolean(packaged))(
  "observes one accepted turn and pauses, resumes after restart, and stops that exact turn",
  async () => {
    const test = fixture();
    const provider = await heldProvider();
    const launch: NativeAgentChatLaunch = {
      resourcesPath: packaged!,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      provider: "openai-compatible",
      endpoint: provider.endpoint,
      model: "fixture",
    };
    let client: NativeAgentChat | undefined;
    try {
      client = await NativeAgentChat.start(launch);
      const session = await client.create();
      const other = await client.create();
      const updates: NativeChatStreamUpdate[] = [];
      const otherUpdates: NativeChatStreamUpdate[] = [];
      client.subscribe(session, (update) => updates.push(update));
      client.subscribe(other, (update) => otherUpdates.push(update));
      await expect(client.observe({ id: session.id })).rejects.toThrow(
        "native_chat_attachment_required"
      );
      const accepted = await client.submit(
        session,
        "fixture-input",
        "Keep working until stopped"
      );
      expect(accepted).toEqual(
        expect.objectContaining({
          disposition: "claimed",
          turnId: expect.any(String),
        })
      );
      await vi.waitFor(() => {
        expect(updates).toContainEqual(
          expect.objectContaining({
            kind: "text",
            role: "assistant",
            turnId: accepted.turnId,
            offsetBytes: 0,
            text: "Working",
            replace: false,
          })
        );
      });
      expect(otherUpdates).toEqual([]);
      expect(
        await client.submit(
          session,
          "fixture-input",
          "Keep working until stopped"
        )
      ).toEqual(accepted);
      const running = await vi.waitFor(
        async () => {
          expect(provider.prompts).toHaveLength(1);
          const snapshot = await client!.observe(session);
          expect(snapshot.current).toEqual(
            expect.objectContaining({
              turnId: accepted.turnId,
              disposition: "running",
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      await expect(
        client.pause(other, running, "wrong-session")
      ).rejects.toThrow("native_chat_turn_observation_required");
      await expect(
        client.pause(session, { ...running }, "fabricated")
      ).rejects.toThrow("native_chat_turn_observation_required");
      await expect(
        client.resume(session, running, "unverified")
      ).rejects.toThrow("native_chat_verified_pause_required");
      const pause = await client.pause(session, running, "pause-fixture");
      expect(await client.pause(session, running, "pause-fixture")).toEqual(
        pause
      );
      const paused = await vi.waitFor(
        async () => {
          const snapshot = await client!.observe(session);
          expect(snapshot.current).toEqual(
            expect.objectContaining({
              turnId: accepted.turnId,
              disposition: "suspended",
              paused: true,
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      expect(provider.prompts).toHaveLength(1);
      await client.close();
      client = await NativeAgentChat.start(launch);
      await expect(client.observe(session)).rejects.toThrow(
        "native_chat_attachment_required"
      );
      const reattached = await client.load(session.id);
      expect(await client.load(session.id)).toBe(reattached);
      expect(await client.inputReceipt(reattached, "fixture-input")).toEqual(
        accepted
      );
      expect((await client.observe(reattached)).current).toEqual(
        paused.current
      );
      const resumed = await client.resume(reattached, paused, "resume-fixture");
      expect(resumed.turnId).toBe(accepted.turnId);
      expect(resumed.epoch).toBeGreaterThan(paused.current!.epoch);
      expect(
        (await client.resume(reattached, paused, "resume-fixture")).epoch
      ).toBe(resumed.epoch);
      const resumedRunning = await vi.waitFor(
        async () => {
          expect(provider.prompts).toHaveLength(2);
          const snapshot = await client!.observe(reattached);
          expect(snapshot.current).toEqual(
            expect.objectContaining({
              turnId: accepted.turnId,
              epoch: resumed.epoch,
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      await expect(
        client.stop(reattached, running, "stale-stop")
      ).rejects.toThrow("stale_session_revision");
      const stopped = await client.stop(
        reattached,
        resumedRunning,
        "stop-fixture"
      );
      expect(
        await client.stop(reattached, resumedRunning, "stop-fixture")
      ).toEqual(stopped);
      await vi.waitFor(
        async () => {
          expect(await client!.observe(reattached)).toEqual(
            expect.objectContaining({
              current: null,
              admissionPaused: true,
              latest: expect.objectContaining({
                turnId: accepted.turnId,
                disposition: "settled",
                status: "cancelled",
              }),
            })
          );
        },
        { timeout: 5000 }
      );
      expect(provider.prompts).toHaveLength(2);
      expect(await client.inputReceipt(reattached, "fixture-input")).toEqual(
        expect.objectContaining({
          inputId: accepted.inputId,
          inputPosition: accepted.inputPosition,
          turnId: accepted.turnId,
          disposition: "completed",
        })
      );
      await client.close();
      client = await NativeAgentChat.start({ ...launch, cwd: test.root });
      await expect(client.load(session.id)).rejects.toThrow(
        "session_workspace_mismatch"
      );
      expect(provider.prompts).toHaveLength(2);
    } finally {
      try {
        await client?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  20000
);
