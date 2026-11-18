import { describe, expect, it, vi } from "vitest";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import type { Workspace } from "@/lib/desktop/bridge";
import { imagesMessageContext } from "@/lib/desktop/images-message-context";
import { workflowMessageContext } from "@/lib/desktop/workflow-message-context";
import { HomeComposer } from "./home-composer";
import { ApplicationPreset } from "./application-preset";

const workspace = { id: "chosen", name: "Chosen" } as Workspace;
const input: HomeComposer.Input = {
  text: "Make a poster",
  prompt: "Make a poster",
  profileId: null,
  target: workspace,
  references: [],
};
function setup() {
  const drafts = new ComposerDrafts(null, null);
  const composer = new HomeComposer(drafts);
  const host: HomeComposer.Host = {
    defaultWorkspace: vi.fn<HomeComposer.Host["defaultWorkspace"]>(
      async () => ({ ...workspace, id: "default" })
    ),
    stash: vi.fn<HomeComposer.Host["stash"]>(() => true),
    open: vi.fn<HomeComposer.Host["open"]>(),
  };
  return { composer, drafts, host };
}

function fullAccess() {
  const review = {
    reviewId: "review",
    chatTitle: "New chat",
    workspaceName: "Chosen",
  };
  const prepared = {
    sessionId: "abf7864b-6bd5-4d77-9159-7d17ddbed879",
    profileId: "a".repeat(64),
  };
  const access = {
    prepare: vi.fn<HomeComposer.FullAccess["prepare"]>(async () => review),
    answer: vi.fn<HomeComposer.FullAccess["answer"]>(async () => {}),
    start: vi.fn<HomeComposer.FullAccess["start"]>(async () => prepared),
  };
  return { access, review, prepared };
}

describe("HomeComposer", () => {
  it("inherits saved effort without overriding the person's explicit choice", () => {
    const { composer } = setup();
    composer.initializeEffort("high");
    expect(composer.read().effort).toBe("high");
    composer.selectEffort("low");
    composer.initializeEffort("xhigh");
    expect(composer.read().effort).toBe("low");
  });

  it("keeps the host default when the model catalog has not loaded yet", async () => {
    const { composer, host } = setup();
    await composer.submit(input, host);
    expect(vi.mocked(host.stash).mock.calls[0][1]).not.toHaveProperty("effort");
  });

  it.each(["Make a pitch", ""])(
    "copies a slides template and keeps its instructions separate from the request (%j)",
    async (text) => {
      const { composer, host } = setup();
      const copyTemplate = vi.fn<HomeComposer.Template["copy"]>(async () => ({
        title: "Pitch",
        slides: 4,
        path: "pitch 2.canvas",
      }));
      await composer.submit(
        {
          ...input,
          text,
          prompt: ApplicationPreset.prompt("slides", text),
          references: [{ title: "Reference", url: "https://example.test/ref" }],
          template: { name: "pitch", copy: copyTemplate },
        },
        host
      );
      expect(copyTemplate).toHaveBeenCalledWith("chosen");
      expect(host.defaultWorkspace).not.toHaveBeenCalled();
      expect(host.stash).toHaveBeenCalledWith(
        "chosen",
        expect.objectContaining({
          text,
          messageContext: {
            modelText: expect.stringContaining(
              '"pitch 2.canvas". Edit that deck and keep its visual system.'
            ),
            displayParts: [
              {
                kind: "slides.template",
                version: 1,
                data: { title: "Pitch", slides: 4 },
              },
            ],
          },
        })
      );
      expect(host.open).toHaveBeenCalledWith(workspace);
    }
  );

  it.each(["goal", "file", "directory"] as const)(
    "keeps a template draft that requires text before copying the deck (%s)",
    async (kind) => {
      const { composer, host } = setup();
      if (kind === "goal") composer.selectGoal(true);
      else
        composer.transfer({
          resources: [{ kind, file: new File(["content"], "notes.txt") }],
        });
      const copyTemplate = vi.fn<HomeComposer.Template["copy"]>();
      await expect(
        composer.submit(
          {
            ...input,
            text: "",
            template: { name: "pitch", copy: copyTemplate },
          },
          host
        )
      ).rejects.toThrow(
        kind === "goal" ? "Write an objective" : "Write a message"
      );
      expect(copyTemplate).not.toHaveBeenCalled();
      expect(host.stash).not.toHaveBeenCalled();
      expect(host.open).not.toHaveBeenCalled();
      expect(composer.read().busy).toBe(false);
    }
  );

  it("opens the review immediately and uses the current model and effort on Send", async () => {
    const { composer, host } = setup();
    const { access, review, prepared } = fullAccess();
    const applied = Promise.withResolvers<typeof prepared>();
    const preparing = Promise.withResolvers<typeof review>();
    access.prepare.mockReturnValueOnce(preparing.promise);
    access.start.mockReturnValueOnce(applied.promise);
    const file = new File(["original"], "reference.png", { type: "image/png" });
    composer.transfer({ resources: [{ kind: "file", file }] });
    composer.selectPlan(true);
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    expect(composer.read().permissionReview?.workspaceName).toBe(
      workspace.name
    );
    expect(access.prepare).toHaveBeenCalledExactlyOnceWith(workspace.id);
    composer.answerPermissionReview(true);
    expect(composer.read().permissionReview).toBeNull();
    expect(access.answer).not.toHaveBeenCalled();
    preparing.resolve(review);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("full_access")
    );
    expect(access.answer).toHaveBeenCalledExactlyOnceWith(
      review.reviewId,
      true
    );
    expect(access.start).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    composer.selectEffort("high");
    const submitting = composer.submit(
      { ...input, profileId: prepared.profileId },
      host
    );
    await vi.waitFor(() =>
      expect(access.start).toHaveBeenCalledExactlyOnceWith(review.reviewId, {
        workspaceId: "chosen",
        profileId: prepared.profileId,
        effort: "high",
      })
    );
    expect(composer.read().permissionReview).toBeNull();
    expect(host.open).not.toHaveBeenCalled();
    applied.resolve(prepared);
    await submitting;
    const request = vi.mocked(host.stash).mock.calls[0][1];
    expect(request).toMatchObject({
      profileId: prepared.profileId,
      preparedSessionId: prepared.sessionId,
      operatingRegime: "plan",
      attachment: { kind: "file" },
    });
    expect(request).not.toHaveProperty("effort");
    expect(request.attachment?.file).toBe(file);
    expect(composer.read().attachment).toBeNull();
    expect(composer.read().plan).toBe(false);
    expect(composer.read().permissionMode).toBe("restricted");
  });

  it("retries a Full access template draft using the same deck and prepared chat", async () => {
    const { composer, host } = setup();
    const { access, prepared } = fullAccess();
    const copy = vi
      .fn<HomeComposer.Template["copy"]>(async () => ({
        title: "Pitch",
        slides: 4,
        path: "pitch.canvas",
      }))
      .mockRejectedValueOnce(new Error("Couldn't copy the deck"));
    const request = { ...input, template: { name: "pitch", copy } };
    vi.mocked(host.stash).mockReturnValueOnce(false);
    composer.selectEffort("low");
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    composer.answerPermissionReview(true);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("full_access")
    );

    await expect(composer.submit(request, host)).rejects.toThrow(
      "Couldn't copy the deck"
    );
    expect(access.start).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(composer.read().permissionMode).toBe("full_access");

    await expect(composer.submit(request, host)).rejects.toThrow(
      "Couldn't keep"
    );
    expect(access.start).toHaveBeenCalledOnce();
    expect(composer.read().permissionMode).toBe("full_access");
    expect(host.open).not.toHaveBeenCalled();

    composer.selectEffort("high");
    await expect(composer.submit(request, host)).rejects.toThrow(
      "Restore the model and effort"
    );
    composer.selectEffort("low");
    await composer.submit(request, host);
    const handoffs = vi.mocked(host.stash).mock.calls;
    expect(handoffs).toHaveLength(2);
    expect(handoffs[1]).toEqual(handoffs[0]);
    expect(handoffs[1][1].preparedSessionId).toBe(prepared.sessionId);
    expect(copy).toHaveBeenCalledTimes(2);
    expect(access.start).toHaveBeenCalledOnce();
    expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it.each([false, true])(
    "retries the same approved chat after the default effort arrives (unverified grant: %s)",
    async (unverified) => {
      const { composer, host } = setup();
      const { access, prepared } = fullAccess();
      if (unverified)
        access.start.mockRejectedValueOnce(
          new Error("native_chat_permission_mode_unverified")
        );
      else vi.mocked(host.stash).mockReturnValueOnce(false);
      composer.selectPermissionMode(
        "full_access",
        { workspace, defaultWorkspace: host.defaultWorkspace },
        access
      );
      composer.answerPermissionReview(true);
      await vi.waitFor(() =>
        expect(composer.read().permissionMode).toBe("full_access")
      );
      await expect(composer.submit(input, host)).rejects.toThrow(
        unverified ? "Send again to check the same chat" : "Couldn't keep"
      );
      expect(host.open).not.toHaveBeenCalled();
      composer.initializeEffort("medium");
      await composer.submit(input, host);
      expect(access.start).toHaveBeenCalledTimes(unverified ? 2 : 1);
      expect(access.start.mock.calls[0][1]).not.toHaveProperty("effort");
      if (unverified)
        expect(access.start.mock.calls[1]).toEqual(access.start.mock.calls[0]);
      expect(host.stash).toHaveBeenLastCalledWith(
        workspace.id,
        expect.objectContaining({ preparedSessionId: prepared.sessionId })
      );
      expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
    }
  );

  it("cancels immediately while Main is still preparing the review", async () => {
    const { composer, drafts, host } = setup();
    const { access, review } = fullAccess();
    const preparing = Promise.withResolvers<typeof review>();
    access.prepare.mockReturnValueOnce(preparing.promise);
    drafts.write(HomeComposer.key, { text: "unsent" });
    composer.selectPlan(true);
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    composer.answerPermissionReview(false);
    expect(composer.read()).toMatchObject({
      busy: false,
      plan: true,
      permissionBusy: false,
      permissionMode: "restricted",
      permissionReview: null,
    });
    preparing.resolve(review);
    await vi.waitFor(() =>
      expect(access.answer).toHaveBeenCalledExactlyOnceWith(
        review.reviewId,
        false
      )
    );
    expect(access.start).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(drafts.read(HomeComposer.key)).toEqual({ text: "unsent" });
  });

  it("refuses to use a Home approval for a different destination", async () => {
    const { composer, host } = setup();
    const { access, review } = fullAccess();
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    composer.answerPermissionReview(true);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("full_access")
    );
    await expect(
      composer.submit({ ...input, target: { ...workspace, id: "other" } }, host)
    ).rejects.toThrow("Choose Full access again");
    expect(access.answer).toHaveBeenLastCalledWith(review.reviewId, false);
    expect(access.start).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(composer.read().permissionMode).toBe("restricted");
  });

  it("hands off the Workflows request to the chosen workspace under Default access", async () => {
    const { composer, host } = setup();
    const text = "Resize every image in an input folder.";
    const messageContext = workflowMessageContext([]);
    await composer.submit(
      {
        ...input,
        text,
        prompt: ApplicationPreset.prompt("workflows", text),
        messageContext,
      },
      host
    );

    expect(host.stash).toHaveBeenCalledWith("chosen", {
      text,
      messageContext,
      profileId: null,
      operatingRegime: "act",
      goal: false,
    });
    expect(messageContext.modelText).toContain("<reminder>Use Grida FX");
    expect(messageContext.displayParts).toEqual([]);
    expect(host.open).toHaveBeenCalledWith(workspace);
  });

  it("starts a normal chat from a workflow reference alone", async () => {
    const { composer, host } = setup();
    const messageContext = workflowMessageContext([
      {
        number: 1,
        title: "Pet",
        showcaseUrl: "https://grida.co/fx/workflows/pet",
        sourceUrl: "https://github.com/gridaco/fx/tree/main/examples/pet",
        templateId: "pet",
      },
    ]);
    await composer.submit(
      {
        ...input,
        text: "",
        prompt: "",
        messageContext,
      },
      host
    );
    expect(host.stash).toHaveBeenCalledExactlyOnceWith("chosen", {
      text: "",
      messageContext,
      profileId: null,
      operatingRegime: "act",
      goal: false,
    });
    expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it.each(["  Use the second image's palette.  ", ""])(
    "hands off selected Library images beside the unmodified request (%j)",
    async (text) => {
      const { composer, host } = setup();
      const references = ["Palette", "Lighting"].map((title, index) => ({
        id: String(index),
        title,
        url: `https://library.grida.co/${title}.png`,
      }));
      const messageContext = imagesMessageContext(references);
      await composer.submit(
        {
          ...input,
          text,
          prompt: ApplicationPreset.prompt("image", text),
          messageContext,
        },
        host
      );
      expect(host.stash).toHaveBeenCalledExactlyOnceWith("chosen", {
        text,
        messageContext,
        profileId: null,
        operatingRegime: "act",
        goal: false,
      });
      expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
    }
  );

  it("hands off an Images prompt with guidance and no references", async () => {
    const { composer, host } = setup();
    const messageContext = imagesMessageContext([]);
    await composer.submit({ ...input, messageContext }, host);
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({ text: input.text, messageContext })
    );
    expect(messageContext.modelText).toContain(
      "<reminder>Create an image for this request.</reminder>"
    );
    expect(messageContext.displayParts).toEqual([]);
  });

  it.each([
    { kind: "file", messageContext: imagesMessageContext([]) },
    { kind: "directory", messageContext: workflowMessageContext([]) },
  ] as const)(
    "keeps a $kind attachment on Home when preset context requires authored text",
    async ({ kind, messageContext }) => {
      const { composer, host } = setup();
      const file = new File(["content"], "notes.txt");
      composer.transfer({ resources: [{ kind, file }] });
      await expect(
        composer.submit({ ...input, text: "  ", messageContext }, host)
      ).rejects.toThrow("Write a message");
      expect(host.stash).not.toHaveBeenCalled();
      expect(host.open).not.toHaveBeenCalled();
      expect(composer.read().attachment).toEqual({ kind, file });
    }
  );

  it("hands off a raster attachment and preset context with no authored text", async () => {
    const { composer, host } = setup();
    const file = new File(["image"], "reference.png", {
      type: "application/octet-stream",
    });
    const messageContext = imagesMessageContext([]);
    composer.transfer({ resources: [{ kind: "file", file }] });
    await composer.submit({ ...input, text: "", messageContext }, host);
    expect(host.stash).toHaveBeenCalledExactlyOnceWith(
      workspace.id,
      expect.objectContaining({
        text: "",
        messageContext,
        attachment: { kind: "file", file },
      })
    );
    expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it("keeps the draft when the selected references exceed the context limit", async () => {
    const { composer, drafts, host } = setup();
    drafts.write(HomeComposer.key, { text: input.text });
    const messageContext = imagesMessageContext([
      {
        id: "long",
        title: "x".repeat(17 * 1024),
        url: "https://library.grida.co/long.png",
      },
    ]);
    await expect(
      composer.submit({ ...input, target: null, messageContext }, host)
    ).rejects.toThrow("Remove some and try again.");
    expect(host.defaultWorkspace).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(drafts.read(HomeComposer.key)).toEqual({ text: input.text });
  });

  it.each(["slides", "workflows", "image"] as const)(
    "opens an empty %s composer without starting work",
    async (preset) => {
      const { composer, host } = setup();
      composer.selectGoal(true);
      await composer.submit(
        {
          ...input,
          target: null,
          text: "",
          prompt: ApplicationPreset.prompt(preset, ""),
          ...(preset === "workflows" && {
            messageContext: workflowMessageContext([]),
          }),
          ...(preset === "image" && {
            messageContext: imagesMessageContext([]),
          }),
        },
        host
      );
      expect(host.defaultWorkspace).toHaveBeenCalledOnce();
      expect(host.stash).not.toHaveBeenCalled();
      expect(host.open).toHaveBeenCalledOnce();
    }
  );

  it("allows image-only requests and sends Goal intent for text requests", async () => {
    const { composer, host } = setup();
    composer.transfer({
      resources: [{ kind: "file", file: new File(["image"], "x.png") }],
    });
    await composer.submit({ ...input, text: "", prompt: "" }, host);
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({
        text: "Inspect the attached file.",
        attachment: expect.anything(),
      })
    );
    const next = setup().composer;
    next.selectGoal(true);
    await next.submit(input, host);
    expect(host.stash).toHaveBeenLastCalledWith(
      "chosen",
      expect.objectContaining({ goal: true })
    );
  });

  it("retains the draft and staged intent if handoff storage fails", async () => {
    const { composer, drafts, host } = setup();
    drafts.write(HomeComposer.key, { text: "unsent" });
    composer.selectPlan(true);
    const file = new File(["file"], "a.txt");
    composer.transfer({ resources: [{ kind: "file", file }] });
    vi.mocked(host.stash).mockReturnValue(false);
    await expect(composer.submit(input, host)).rejects.toThrow("Couldn't keep");
    expect(host.open).not.toHaveBeenCalled();
    expect(composer.read()).toMatchObject({
      busy: false,
      plan: true,
      attachment: { file },
    });
    expect(drafts.read(HomeComposer.key)).toEqual({ text: "unsent" });
  });

  it("does not open twice while template preparation waits", async () => {
    const { composer, host } = setup();
    let finish!: (value: {
      title: string;
      slides: number;
      path: string;
    }) => void;
    const copyTemplate = () =>
      new Promise<{ title: string; slides: number; path: string }>(
        (resolve) => {
          finish = resolve;
        }
      );
    const first = composer.submit(
      { ...input, template: { name: "pitch", copy: copyTemplate } },
      host
    );
    await expect(composer.submit(input, host)).rejects.toThrow(
      "already opening"
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish({ title: "Pitch", slides: 4, path: "pitch.canvas" });
    await first;
    expect(host.open).toHaveBeenCalledOnce();
    expect(host.stash).toHaveBeenCalledOnce();
    await expect(composer.submit(input, host)).rejects.toThrow(
      "already opening"
    );
  });

  it("keeps Goal and attachment mutually exclusive and handles single-file intake", () => {
    const { composer } = setup();
    const file = new File(["text"], "a.txt");
    composer.selectGoal(true);
    composer.transfer({ resources: [{ kind: "file", file }] });
    expect(composer.read().attachment).toBeNull();
    composer.selectGoal(false);
    composer.transfer({ resources: [{ kind: "file", file }] });
    composer.selectGoal(true);
    expect(composer.read().goal).toBe(false);
    composer.transfer({
      resources: [
        { kind: "file", file },
        { kind: "file", file },
      ],
    });
    expect(composer.read().notice).toBe("Attach one file at a time.");
    expect(composer.read().attachment?.file).toBe(file);
  });

  it("restores draft modes and image bytes through the existing draft store", async () => {
    const { drafts } = setup();
    const file = new File(["png"], "a.png", { type: "image/png" });
    drafts.writeModes(HomeComposer.key, { plan: true });
    await drafts.writeAttachment(HomeComposer.key, {
      kind: "image",
      name: file.name,
      file,
    });
    const restored = new HomeComposer(drafts);
    await restored.restore();
    expect(restored.read()).toMatchObject({ plan: true, attachment: { file } });
    restored.removeAttachment();
    expect(await drafts.readAttachment(HomeComposer.key)).toBeNull();
  });

  it("awaits attachment restoration before submitting and freezes staged intent meanwhile", async () => {
    let resolve!: (value: { kind: "image"; name: string; file: File }) => void;
    const drafts = new ComposerDrafts(null, {
      get: () =>
        new Promise((r) => {
          resolve = r;
        }),
      put: async () => {},
      delete: async () => {},
    });
    const composer = new HomeComposer(drafts);
    const { host } = setup();
    const file = new File(["saved"], "saved.png", { type: "image/png" });
    const sending = composer.submit(input, host);
    composer.selectPlan(true);
    composer.selectEffort("ultra");
    composer.transfer({
      resources: [{ kind: "file", file: new File(["late"], "late.txt") }],
    });
    composer.removeAttachment();
    expect(host.stash).not.toHaveBeenCalled();
    resolve({ kind: "image", name: file.name, file });
    await sending;
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({
        operatingRegime: "act",
        attachment: { kind: "file", file },
      })
    );
  });

  it("keeps rich drafts with relative references scoped to their destination", () => {
    const { composer, drafts } = setup();
    const a = composer.draftFor("workspace-a");
    const b = composer.draftFor("workspace-b");
    drafts.write(a.key, { mention: "src/file.ts" });
    expect(drafts.read(b.key)).toBeNull();
    expect(drafts.read(composer.draftFor("workspace-a").key)).toEqual({
      mention: "src/file.ts",
    });
  });

  it("does not overwrite a newly selected file with late restored content", async () => {
    let resolve!: (value: null) => void;
    const drafts = new ComposerDrafts(null, {
      get: () =>
        new Promise((r) => {
          resolve = r;
        }),
      put: async () => {},
      delete: async () => {},
    });
    const composer = new HomeComposer(drafts);
    const restore = composer.restore();
    const file = new File(["new"], "new.txt");
    composer.transfer({ resources: [{ kind: "file", file }] });
    resolve(null);
    await restore;
    expect(composer.read().attachment?.file).toBe(file);
  });
});

describe("ApplicationPreset prompt intent", () => {
  it("adds the plain Slides intent and leaves Images guidance to its context", () => {
    expect(ApplicationPreset.prompt("general", "  Hello  ")).toBe("Hello");
    expect(ApplicationPreset.prompt("slides", "My topic")).toBe(
      "Create an editable slide deck.\n\nMy topic"
    );
    expect(ApplicationPreset.prompt("image", "A blue bird")).toBe(
      "A blue bird"
    );
  });
});
