// GRIDA-SEC-004 / GRIDA-SEC-014 — scoped native capture and reviewed provider transfer.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import type { ImageReferenceReview } from "./native-image-generation";
import { NativeProviderSelection } from "./native-provider-selection";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const original =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
const replacement =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z88AAAMfAQ+5sXHtAAAAAElFTkSuQmCC";
const source = "assets/source.png";
const captureTool = "capture_image_reference";
const generationTool = "generate_image_from_workspace_reference";
const poll = { timeout: 7000 };

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "uses only the approved PNG captured in the same workspace turn across pause and reopen",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-workspace-image-")
    );
    const credentials = path.join(root, "credentials");
    const cwd = path.join(root, "workspace");
    const sourcePath = path.join(cwd, source);
    const requests: Record<string, unknown>[] = [];
    const review = vi.fn<ImageReferenceReview>(async ({ signal }) => ({
      kind: "approved",
      signal,
      check: () => signal.throwIfAborted(),
      close: () => {},
    }));
    const image = vi.fn<(input: RequestInit) => Promise<Response>>(
      async (input) => {
        const body = JSON.parse(String(input.body));
        expect(body.reference_png).toBe(original);
        expect(body).not.toHaveProperty("referenceOrigin");
        expect(body).not.toHaveProperty("referencePath");
        expect(JSON.stringify(body)).not.toContain(source);
        return Response.json({
          model_id: body.model_id,
          provider_id: body.provider,
          stored_media: {
            id: "cf1e741a-cddd-4c14-b5f4-bf6a44b5ed28",
            file_name: "image-1.png",
            media_type: "image/png",
            byte_size: 120,
            created_at: 1,
          },
        });
      }
    );
    let owner: NativeAgentChat | undefined;
    let referenceId: string;
    try {
      await fs.mkdir(credentials, { mode: 0o700 });
      await fs.mkdir(path.dirname(sourcePath), { recursive: true });
      await fs.writeFile(sourcePath, Buffer.from(original, "base64"));
      await fs.symlink("source.png", path.join(cwd, "assets/alias.png"));
      const secrets = new SecretsStore(new AuthStore(root), credentials);
      await secrets.set("openrouter", "workspace-reference-fixture-key");
      const start = async () =>
        NativeAgentChat.start({
          ...(await NativeProviderSelection.builtInByok(
            "openrouter",
            "openai/gpt-5.6-terra",
            {
              credentialHome: credentials,
              hasKey: (id) => secrets.has(id),
              imageRequest: image,
              network: async () => ({
                prepare: () => async (body) => {
                  const request = JSON.parse(body.toString());
                  const step = requests.push(request);
                  if (step === 1)
                    return tool(captureTool, { path: "assets/alias.png" });
                  if (step === 2) return tool(captureTool, { path: source });
                  if (step === 3) {
                    referenceId =
                      lastToolResult(request).structured?.reference_id;
                    if (typeof referenceId !== "string")
                      throw new Error("fixture capture receipt missing");
                    return tool("design_search", {
                      initial_search_query: "blue circles",
                    });
                  }
                  if (step === 4 || step === 6)
                    return tool(generationTool, {
                      prompt: "Generate a matching image",
                      workspace_reference_id: referenceId,
                    });
                  return completion({ content: "Finished." }, "stop");
                },
              }),
            }
          )),
          resourcesPath: resources!,
          stateDirectory: path.join(root, "state"),
          cwd,
          workspace: {
            id: "workspace-image-reference",
            primary: { id: "primary", name: "Workspace", path: cwd },
            additionalReadRoots: [],
            protectedPaths: [credentials],
          },
          reviewImageReference: review,
        });
      const first = await start();
      owner = first;
      const chat = await first.create();
      const accepted = await first.submitWithLibrarySelection(
        chat,
        "generate-from-workspace",
        "Generate an image from assets/source.png. Ask about a Library selection before generation.",
        "act"
      );
      const waiting = await vi.waitFor(async () => {
        const snapshot = await first.observe(chat);
        expect(snapshot.current).toMatchObject({
          turnId: accepted.turnId,
          disposition: "suspended",
        });
        return snapshot;
      }, poll);
      expect(JSON.stringify(requests[0].tools)).toContain(generationTool);
      expect(lastToolResult(requests[1]).status).toBe("failed");
      expect(lastToolResult(requests[2])).toMatchObject({
        status: "succeeded",
        structured: { reference_id: expect.any(String), path: source },
      });
      expect(JSON.stringify(requests[2])).not.toContain(original);
      await first.pause(chat, waiting, "pause-before-transfer");
      const paused = await first.observe(chat);
      const [selection] = await first.librarySelections(chat, paused);
      expect(selection).toBeDefined();
      await first.answerLibrarySelection(chat, selection, { kind: "skipped" });
      await fs.writeFile(sourcePath, Buffer.from(replacement, "base64"));
      expect(image).not.toHaveBeenCalled();
      await first.close();
      owner = undefined;

      const reopened = await start();
      owner = reopened;
      const restored = await reopened.load(chat.id);
      const held = await reopened.observe(restored);
      expect(held.current).toMatchObject({
        turnId: accepted.turnId,
        disposition: "suspended",
        paused: true,
      });
      expect(requests).toHaveLength(3);
      await reopened.resume(restored, held, "resume-captured-reference");
      await finished(reopened, restored, accepted.turnId);
      expect(review).toHaveBeenCalledExactlyOnceWith({
        model: expect.any(String),
        signal: expect.any(AbortSignal),
        source: { kind: "workspace", path: source },
      });
      expect(image).toHaveBeenCalledOnce();
      expect(requests).toHaveLength(5);

      const stale = await submitWhenIdle(reopened, restored);
      await finished(reopened, restored, stale.turnId);
      expect(lastToolResult(requests[6]).status).toBe("failed");
      expect(review).toHaveBeenCalledOnce();
      expect(image).toHaveBeenCalledOnce();
    } finally {
      try {
        await owner?.close();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  55_000
);

type Chat = Awaited<ReturnType<NativeAgentChat["create"]>>;

async function submitWhenIdle(owner: NativeAgentChat, chat: Chat) {
  const deadline = Date.now() + poll.timeout;
  for (;;) {
    try {
      return await owner.submit(
        chat,
        "stale-workspace-reference",
        "Try to reuse the earlier turn's capture.",
        "act"
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "session_prompt_in_progress" ||
        Date.now() >= deadline
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

async function finished(
  owner: NativeAgentChat,
  chat: Chat,
  turnId: string | null
) {
  if (!turnId) throw new Error("fixture submission was not claimed");
  await vi.waitFor(async () => {
    expect((await owner.observe(chat)).latest).toMatchObject({
      turnId,
      status: "succeeded",
    });
  }, poll);
}

function lastToolResult(request: Record<string, unknown>) {
  const messages = request.messages as { role: string; content: string }[];
  return JSON.parse(messages.findLast(({ role }) => role === "tool")!.content);
}

function tool(name: string, args: object) {
  return completion(
    {
      tool_calls: [
        {
          index: 0,
          id: `fixture-${name}-${JSON.stringify(args).length}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    "tool_calls"
  );
}

function completion(delta: object, finish_reason: "tool_calls" | "stop") {
  const chunk = {
    id: "workspace-reference-fixture",
    choices: [{ index: 0, delta, finish_reason }],
  };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}
