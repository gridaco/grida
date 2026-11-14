// GRIDA-SEC-004 / GRIDA-SEC-014 — built workers retain, review, and publish exact media.
import { AuthStore, MediaStore, SecretsStore } from "@grida/daemon/server";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeImagePlacement } from "./native-image-placement";
import { NativeProviderSelection } from "./native-provider-selection";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import { WorkspaceFileWorkers } from "./workspace-file-worker";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC",
  "base64"
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "reopens a generated image and retries its approved placement without overwriting or generating again",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-image-placement-")
    );
    const credentialHome = path.join(root, "credentials");
    const browserData = path.join(root, "browser");
    const mediaRoot = path.join(root, "media");
    const cwd = path.join(root, "workspace");
    const relative = "assets/banner.png";
    const destination = path.join(cwd, relative);
    const preexisting = Buffer.from("existing design bytes");
    const digest = createHash("sha256").update(PNG).digest("hex");
    const workers = new WorkspaceFileWorkers(resources!);
    const requests: Record<string, unknown>[] = [];
    let sourceTurnId: string | undefined;
    let owner: NativeAgentChat | undefined;
    try {
      await fs.mkdir(credentialHome, { mode: 0o700 });
      await fs.mkdir(browserData, { mode: 0o700 });
      await fs.mkdir(path.dirname(destination), {
        recursive: true,
        mode: 0o700,
      });
      await fs.writeFile(destination, preexisting, { flag: "wx" });
      const catalog = new NativeWorkspaceCatalog({
        browserData,
        projectsRoot: path.join(root, "projects"),
        protectedPaths: [credentialHome, mediaRoot],
      });
      const workspace = await catalog.openSelected(cwd);
      const grant = await catalog.fileGrant(workspace.id);
      const secrets = new SecretsStore(new AuthStore(root), credentialHome);
      await secrets.set("openrouter", "image-placement-fixture-key");
      const media = new MediaStore(mediaRoot);
      const imageRequest = vi.fn<(init: RequestInit) => Promise<Response>>(
        async (init) => {
          const body = JSON.parse(String(init.body));
          expect(body).toMatchObject({ receipt_sha256: true, n: 1 });
          const item = await media.save({
            file_name: "image-1.png",
            media_type: "image/png",
            bytes: PNG,
          });
          return Response.json({
            model_id: body.model_id,
            provider_id: body.provider,
            stored_media: item,
            sha256: digest,
          });
        }
      );
      const reviewed: string[] = [];
      const start = async () => {
        const launch = await NativeProviderSelection.builtInByok(
          "openrouter",
          "openai/gpt-5.6-terra",
          {
            credentialHome,
            hasKey: (id) => secrets.has(id),
            imageRequest,
            network: async () => ({
              prepare: () => async (body) => {
                requests.push(JSON.parse(body.toString()));
                if (requests.length === 1)
                  return tool("generate_image", { prompt: "A blue circle" });
                if (requests.length === 2 || requests.length === 4) {
                  const [item] = await media.list();
                  if (!item) throw new Error("fixture media receipt missing");
                  return tool("place_generated_image", {
                    media_id: item.id,
                    path: relative,
                    ...(requests.length === 4 && {
                      source_turn_id: sourceTurnId,
                    }),
                  });
                }
                return completion({ content: "Finished." }, "stop");
              },
            }),
          }
        );
        return NativeAgentChat.start({
          ...launch,
          resourcesPath: resources!,
          stateDirectory: path.join(root, "state"),
          cwd,
          workspace: {
            id: workspace.id,
            primary: { id: "primary", name: "Workspace", path: cwd },
            additionalReadRoots: [],
            protectedPaths: [credentialHome, mediaRoot],
          },
          imagePlacement: new NativeImagePlacement(grant, {
            catalog,
            workers,
            media: new MediaStore(mediaRoot),
            async review({ relative, signal }) {
              reviewed.push(relative);
              return {
                kind: "approved",
                check: () => {},
                signal,
                close: () => {},
              };
            },
          }),
        });
      };
      const original = await start();
      owner = original;
      const session = await original.create();
      const generated = await original.submit(
        session,
        "generate-and-place",
        "Generate a blue circle and place it.",
        "act"
      );
      if (!generated.turnId)
        throw new Error("fixture generation was not claimed");
      sourceTurnId = generated.turnId;
      await finished(original, session, sourceTurnId);
      expect(requests).toHaveLength(3);
      expect(JSON.stringify(requests[0].tools)).toContain(
        "place_generated_image"
      );
      expect(JSON.stringify(requests[1].messages)).toContain(sourceTurnId);
      expect(JSON.stringify(requests[1].messages)).not.toContain(digest);
      expect(JSON.stringify(requests[2].messages)).toContain(
        "image_placement_conflict"
      );
      await expect(fs.readFile(destination)).resolves.toEqual(preexisting);
      expect(reviewed).toEqual([relative]);
      expect(imageRequest).toHaveBeenCalledOnce();

      await original.close();
      owner = undefined;
      const reopened = await start();
      owner = reopened;
      const restored = await reopened.load(session.id);
      await finished(reopened, restored, sourceTurnId);
      expect(requests).toHaveLength(3);
      await fs.unlink(destination);
      const retry = await reopened.submit(
        restored,
        "retry-exact-placement",
        "Place the same retained image at the same destination.",
        "act"
      );
      if (!retry.turnId)
        throw new Error("fixture placement retry was not claimed");
      await finished(reopened, restored, retry.turnId);
      expect(requests).toHaveLength(5);
      expect(JSON.stringify(requests[4].messages)).toContain("published");
      await expect(fs.readFile(destination)).resolves.toEqual(PNG);
      expect(reviewed).toEqual([relative, relative]);
      expect(imageRequest).toHaveBeenCalledOnce();
    } finally {
      try {
        await owner?.close();
      } finally {
        workers.close();
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  45_000
);

async function finished(
  chat: NativeAgentChat,
  session: Awaited<ReturnType<NativeAgentChat["create"]>>,
  turnId: string
) {
  const snapshot = await vi.waitFor(
    async () => {
      const observed = await chat.observe(session);
      expect(observed.latest).toMatchObject({ turnId, disposition: "settled" });
      return observed;
    },
    { timeout: 7000 }
  );
  const account = await chat.turnSummary(session, snapshot);
  if (snapshot.latest?.status !== "succeeded") throw new Error(account.text);
}

function tool(name: string, args: object) {
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

function completion(delta: object, finish_reason: "tool_calls" | "stop") {
  const chunk = {
    id: "image-placement-fixture",
    choices: [{ index: 0, delta, finish_reason }],
  };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}
