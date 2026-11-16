import { describe, expect, it, vi } from "vitest";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import type { Workspace } from "@/lib/desktop/bridge";
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

  it("keeps the chosen destination for references and real template preparation", async () => {
    const { composer, host } = setup();
    const copyTemplate = vi.fn<NonNullable<HomeComposer.Input["copyTemplate"]>>(
      async () => ({
        title: "Pitch",
        slides: 4,
        path: "pitch.canvas",
      })
    );
    await composer.submit(
      {
        ...input,
        references: [{ title: "Reference", url: "https://example.test/ref" }],
        copyTemplate,
      },
      host
    );
    expect(copyTemplate).toHaveBeenCalledWith("chosen");
    expect(host.defaultWorkspace).not.toHaveBeenCalled();
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({ text: expect.stringContaining("pitch.canvas") })
    );
    expect(host.open).toHaveBeenCalledWith(workspace);
  });

  it("carries effort, Plan and the original file in one request", async () => {
    const { composer, host } = setup();
    const file = new File(["original"], "reference.png", { type: "image/png" });
    composer.transfer({ resources: [{ kind: "file", file }] });
    composer.selectPlan(true);
    composer.selectEffort("high");
    await composer.submit(input, host);
    const request = vi.mocked(host.stash).mock.calls[0][1];
    expect(request).toMatchObject({
      effort: "high",
      operatingRegime: "plan",
      attachment: { kind: "file" },
    });
    expect(request.attachment?.file).toBe(file);
    expect(composer.read().attachment).toBeNull();
    expect(composer.read().plan).toBe(false);
  });

  it("opens an empty composer without starting work, even with an output preset or modes", async () => {
    const { composer, host } = setup();
    composer.selectGoal(true);
    await composer.submit(
      {
        ...input,
        target: null,
        text: "",
        prompt: ApplicationPreset.prompt("slides", ""),
      },
      host
    );
    expect(host.defaultWorkspace).toHaveBeenCalledOnce();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).toHaveBeenCalledOnce();
  });

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
    const first = composer.submit({ ...input, copyTemplate }, host);
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
  it("makes Slides/Images explicit without claiming a skill invocation", () => {
    expect(ApplicationPreset.prompt("general", "  Hello  ")).toBe("Hello");
    expect(ApplicationPreset.prompt("slides", "My topic")).toBe(
      "Create an editable slide deck.\n\nMy topic"
    );
    expect(ApplicationPreset.prompt("image", "A blue bird")).toBe(
      "Create an image.\n\nA blue bird"
    );
  });
});
