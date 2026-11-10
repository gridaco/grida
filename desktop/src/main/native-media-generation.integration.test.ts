// GRIDA-SEC-004 — built worker and Main media authority without external egress.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeProviderSelection } from "./native-provider-selection";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const model = "openai/gpt-5.6-terra";
const credential = "retained-image-fixture-key";
const mediaId = "cf1e741a-cddd-4c14-b5f4-bf6a44b5ed28";
const libraryId = "c04cacb3-70ba-4181-89cf-27079ea97ca2";
const referencePng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
const prompt = "A blue circle on a clear background";
const poll = { timeout: 7000 };

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "runs a retained image tool on the captured BYOK connection and restores it without generation",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-media-proof-")
    );
    const credentialHome = path.join(root, "credentials");
    const cwd = path.join(root, "workspace");
    const stateDirectory = path.join(root, "state");
    const media = vi.fn<(init: RequestInit) => Promise<Response>>(
      async (init) => {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          provider: "openrouter",
          prompt,
          background: "transparent",
          n: 1,
        });
        expect(body.model_id).toEqual(expect.any(String));
        expect(body.binding_id).toEqual(expect.any(String));
        expect(body.reference_png).toBe(
          media.mock.calls.length === 4 ? referencePng : undefined
        );
        const { nonce, proof } = body.credential;
        expect(nonce).toMatch(/^[a-f0-9]{32}$/);
        expect(proof).toBe(
          createHash("sha256")
            .update(`grida-desktop-image-key-v1\0${nonce}\0${credential}`)
            .digest("hex")
        );
        expect(String(init.body)).not.toContain(credential);
        expect(new Headers(init.headers).get("accept")).toBe(
          "application/vnd.grida.retained-image+json"
        );
        return Response.json({
          model_id: body.model_id,
          provider_id: body.provider,
          stored_media: {
            id: mediaId,
            file_name: "image-1.png",
            media_type: "image/png",
            byte_size: 120,
            created_at: 1,
          },
        });
      }
    );
    const chatRequests: Record<string, unknown>[] = [];
    let owner: NativeAgentChat | undefined;
    try {
      await Promise.all(
        [credentialHome, cwd].map((directory) =>
          fs.mkdir(directory, { mode: 0o700 })
        )
      );
      const secrets = new SecretsStore(new AuthStore(root), credentialHome);
      await secrets.set("openrouter", credential);
      const select = (chatModel: string) =>
        NativeProviderSelection.builtInByok("openrouter", chatModel, {
          credentialHome,
          hasKey: (id) => secrets.has(id),
          imageRequest: media,
          network: async () => ({
            prepare: (target, headers) => {
              expect(target).toBe(
                "https://openrouter.ai/api/v1/chat/completions"
              );
              expect(headers.get("authorization")).toBe(`Bearer ${credential}`);
              return async (body) => {
                chatRequests.push(JSON.parse(body.toString()));
                const step = chatRequests.length;
                if (step === 6)
                  return toolCompletion("design_search", {
                    initial_search_query: "blue circles",
                  });
                if ([1, 4, 5, 7, 9, 11].includes(step))
                  return toolCompletion("generate_image", {
                    prompt,
                    background: "transparent",
                    ...([7, 9].includes(step) && {
                      library_reference_id: libraryId,
                    }),
                  });
                return completion({ content: "Finished." }, "stop");
              };
            },
          }),
        });
      const start = async (chatModel = model, state = stateDirectory) => {
        const launch = await select(chatModel);
        expect(launch.imageGeneration).toBeDefined();
        return NativeAgentChat.start({
          ...launch,
          resourcesPath: resources!,
          stateDirectory: state,
          cwd,
          workspace: {
            id: "media-workspace",
            primary: { id: "primary", name: "Workspace", path: cwd },
            additionalReadRoots: [],
            protectedPaths: [credentialHome],
          },
        });
      };
      const chat = await start();
      owner = chat;
      const session = await chat.create();
      const accepted = await chat.submit(
        session,
        "generate-once",
        prompt,
        "act"
      );
      const finished = await vi.waitFor(async () => {
        const observed = await chat.observe(session);
        expect(observed.latest).toMatchObject({
          turnId: accepted.turnId,
          status: "succeeded",
        });
        return observed;
      }, poll);
      expect((await chat.turnSummary(session, finished)).text).toMatch(
        /generated image.*Recents/i
      );
      expect(media).toHaveBeenCalledOnce();
      expect(chatRequests).toHaveLength(2);
      expect(chatRequests[0].tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({ name: "generate_image" }),
          }),
        ])
      );
      const continuation = JSON.stringify(chatRequests[1]);
      expect(continuation).toContain(mediaId);
      expect(continuation).toContain("image/png");
      expect(continuation).not.toContain(credential);
      expect(continuation).not.toContain(credentialHome);
      expect(continuation).not.toContain(
        JSON.parse(String(media.mock.calls[0][0].body)).credential.proof
      );

      await chat.close();
      owner = undefined;
      const reopened = await start();
      owner = reopened;
      const attached = await reopened.load(session.id);
      const restored = await reopened.observe(attached);
      expect(restored.latest).toMatchObject({
        turnId: accepted.turnId,
        status: "succeeded",
      });
      expect((await reopened.turnSummary(attached, restored)).text).toMatch(
        /generated image.*Recents/i
      );
      expect(media).toHaveBeenCalledOnce();
      expect(chatRequests).toHaveLength(2);

      const planned = await reopened.submit(
        attached,
        "plan-only",
        "Plan a new image.",
        "plan"
      );
      await vi.waitFor(async () => {
        expect((await reopened.observe(attached)).latest).toMatchObject({
          turnId: planned.turnId,
          status: "succeeded",
        });
      }, poll);
      expect(chatRequests).toHaveLength(3);
      expect(JSON.stringify(chatRequests[2].tools ?? [])).not.toContain(
        "generate_image"
      );
      expect(media).toHaveBeenCalledOnce();

      media.mockImplementationOnce(({ signal }) => {
        if (!signal) throw new Error("media fixture missing abort signal");
        return new Promise<Response>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      });
      const interrupted = await reopened.submit(
        attached,
        "stop-once",
        prompt,
        "act"
      );
      await vi.waitFor(() => expect(media).toHaveBeenCalledTimes(2), poll);
      const active = await reopened.observe(attached);
      expect(active.current?.turnId).toBe(interrupted.turnId);
      await reopened.stop(attached, active, "stop-dispatch");
      await vi.waitFor(
        () => expect(media.mock.calls[1][0].signal?.aborted).toBe(true),
        poll
      );
      await vi.waitFor(async () => {
        expect((await reopened.observe(attached)).latest).toMatchObject({
          turnId: interrupted.turnId,
          disposition: "settled",
        });
      }, poll);
      expect(media).toHaveBeenCalledTimes(2);

      media.mockImplementationOnce(async (init) => {
        const body = JSON.parse(String(init.body));
        return Response.json({
          model_id: body.model_id,
          provider_id: body.provider,
          stored_media: null,
        });
      });
      const separate = await reopened.create();
      const unretained = await reopened.submit(
        separate,
        "generated-without-retention",
        prompt,
        "act"
      );
      const noCopy = await vi.waitFor(async () => {
        const observed = await reopened.observe(separate);
        expect(observed.latest).toMatchObject({
          turnId: unretained.turnId,
          status: "uncertain",
        });
        return observed;
      }, poll);
      expect((await reopened.turnSummary(separate, noCopy)).text).toMatch(
        /generated.*could not retain/i
      );
      expect(media).toHaveBeenCalledTimes(3);
      expect(chatRequests).toHaveLength(5);

      const referenceChat = await reopened.create();
      const referenced = await reopened.submitWithLibrarySelection(
        referenceChat,
        "select-and-generate",
        "Select a Library reference, then generate an image with it.",
        "act"
      );
      const waiting = await vi.waitFor(async () => {
        const snapshot = await reopened.observe(referenceChat);
        expect(snapshot.current).toMatchObject({
          turnId: referenced.turnId,
          disposition: "suspended",
        });
        return snapshot;
      }, poll);
      await reopened.pause(referenceChat, waiting, "hold-library-selection");
      const paused = await reopened.observe(referenceChat);
      expect(paused.current?.paused).toBe(true);
      const reviews = await reopened.librarySelections(referenceChat, paused);
      expect(reviews).toHaveLength(1);
      expect(reviews[0].initialSearchQuery).toBe("blue circles");
      await reopened.answerLibrarySelection(referenceChat, reviews[0], {
        kind: "selected",
        id: libraryId,
        png: Uint8Array.from(Buffer.from(referencePng, "base64")),
      });
      expect(media).toHaveBeenCalledTimes(3);
      expect(chatRequests).toHaveLength(6);
      await reopened.close();
      owner = undefined;

      const resumed = await start();
      owner = resumed;
      const referenceSession = await resumed.load(referenceChat.id);
      const held = await resumed.observe(referenceSession);
      expect(held.current).toMatchObject({
        turnId: referenced.turnId,
        disposition: "suspended",
        paused: true,
      });
      expect(chatRequests).toHaveLength(6);
      await resumed.resume(referenceSession, held, "resume-with-reference");
      await vi.waitFor(async () => {
        expect((await resumed.observe(referenceSession)).latest).toMatchObject({
          turnId: referenced.turnId,
          status: "succeeded",
        });
      }, poll);
      expect(media).toHaveBeenCalledTimes(4);
      expect(chatRequests).toHaveLength(8);
      expect(JSON.stringify(chatRequests[5].tools)).toContain(
        "library_reference_id"
      );
      expect(JSON.stringify(chatRequests[6])).toContain(
        `data:image/png;base64,${referencePng}`
      );

      const stale = await resumed.submitWithLibrarySelection(
        referenceSession,
        "prior-reference",
        "Try to generate with the prior turn's reference.",
        "act"
      );
      await vi.waitFor(async () => {
        expect((await resumed.observe(referenceSession)).latest).toMatchObject({
          turnId: stale.turnId,
          status: "succeeded",
        });
      }, poll);
      expect(media).toHaveBeenCalledTimes(4);
      expect(chatRequests).toHaveLength(10);
      expect(JSON.stringify(chatRequests[8])).not.toContain(referencePng);
      const messages = chatRequests[9].messages as {
        role: string;
        content: string;
      }[];
      const refusal = messages.findLast((message) => message.role === "tool");
      expect(JSON.parse(refusal!.content)).toMatchObject({ status: "failed" });

      await resumed.close();
      owner = undefined;
      const textOnly = await start(
        "openai/gpt-5.5",
        path.join(root, "text-state")
      );
      owner = textOnly;
      expect(textOnly.acceptsLibrarySelection).toBe(false);
      const plainSession = await textOnly.create();
      const plain = await textOnly.submit(
        plainSession,
        "text-only",
        prompt,
        "act"
      );
      await vi.waitFor(async () => {
        expect((await textOnly.observe(plainSession)).latest).toMatchObject({
          turnId: plain.turnId,
          status: "succeeded",
        });
      }, poll);
      expect(media).toHaveBeenCalledTimes(5);
      expect(chatRequests).toHaveLength(12);
      expect(JSON.stringify(chatRequests[10].tools)).toContain(
        "generate_image"
      );
      expect(JSON.stringify(chatRequests[10].tools)).not.toContain(
        "library_reference_id"
      );
    } finally {
      try {
        await owner?.close();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  75_000
);

function toolCompletion(name: string, args: object): Response {
  return completion(
    {
      tool_calls: [
        {
          index: 0,
          id: `fixture-${name}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    "tool_calls"
  );
}

function completion(
  delta: object,
  finishReason: "tool_calls" | "stop"
): Response {
  const chunk = {
    id: "retained-image-chat-fixture",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}
