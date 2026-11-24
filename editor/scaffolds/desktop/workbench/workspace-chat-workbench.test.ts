import { expect, it, vi } from "vitest";
import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
import { WorkspaceChatWorkbench } from "./workspace-chat-workbench";

const current = () => true;
const chat = (id: string) => ({ kind: "chat" as const, id });
const file = (name: string): WorkspaceFsEntry => ({
  kind: "file",
  name,
  rel_path: name,
});

function fixture() {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  };
  const create = () =>
    new WorkspaceChatWorkbench("project", null, storage, async () => [
      file("brief.md"),
      file("plan.svg"),
      file("slides.svg"),
    ]);
  return { create, storage };
}

it("opens a new chat independently and restores each chat's tabs and order", async () => {
  const { create, storage } = fixture();
  WorkspaceViewState.remember(storage, "project", {
    tabs: { open: ["brief.md"], active: "brief.md" },
  });
  const workbench = create();
  await workbench.activateWorkbench(chat("a"), current);
  expect(workbench.readEditorSurfaces().open).toEqual([]);
  await workbench.open("/brief.md", current);
  await workbench.open("/plan.svg", current);
  const group = workbench.read().session.group;
  group.move(group.getSnapshot().tabs[1]!, group.getSnapshot().tabs[0]!);

  await workbench.activateWorkbench(chat("b"), current);
  expect(workbench.readEditorSurfaces().open).toEqual([]);
  expect([...workbench.referencedFiles()]).toEqual(["plan.svg", "brief.md"]);
  await workbench.open("/slides.svg", current);
  await workbench.activateWorkbench(chat("a"), current);
  expect(workbench.readEditorSurfaces()).toMatchObject({
    open: ["/plan.svg", "/brief.md"],
    active: "/plan.svg",
  });
  const restarted = create();
  await restarted.activateWorkbench(chat("b"), current);
  expect(restarted.readEditorSurfaces().open).toEqual(["/slides.svg"]);
});

it("promotes a seeded Home draft in place and forgets only a deleted chat", async () => {
  const { create } = fixture();
  const workbench = create();
  await workbench.activateWorkbench(
    { kind: "draft", id: "home" },
    current,
    "slides.svg"
  );
  expect(workbench.readEditorSurfaces().open).toEqual(["/slides.svg"]);
  const session = workbench.read().session;
  workbench.promoteWorkbench("home", "a");
  expect(workbench.read().session).toBe(session);
  const beforeDeletion = create();
  await beforeDeletion.activateWorkbench(chat("a"), current);
  expect(beforeDeletion.readEditorSurfaces().open).toEqual(["/slides.svg"]);
  workbench.forgetWorkbench("a");
  await workbench.open("/plan.svg", current);
  await workbench.activateWorkbench(chat("b"), current, "brief.md");
  expect(workbench.referencedFiles().has("slides.svg")).toBe(false);

  const restarted = create();
  await restarted.activateWorkbench(chat("a"), current);
  expect(restarted.readEditorSurfaces().open).toEqual([]);
  await restarted.activateWorkbench(chat("b"), current);
  expect(restarted.readEditorSurfaces().open).toEqual(["/brief.md"]);
});

it("restores the standalone project layout when chat is unavailable", async () => {
  const { create, storage } = fixture();
  WorkspaceViewState.remember(storage, "project", {
    tabs: { open: ["brief.md"], active: "brief.md" },
  });
  const workbench = create();
  workbench.openRoutePath("plan.svg");
  await workbench.openProjectView();
  expect(workbench.readEditorSurfaces()).toMatchObject({
    open: ["/brief.md", "/plan.svg"],
    active: "/plan.svg",
  });

  await workbench.activateWorkbench(chat("a"), current);
  expect(workbench.readEditorSurfaces().open).toEqual([]);
});

it("drops a file reveal that resolves after the original view has switched", async () => {
  const { storage } = fixture();
  let finish!: (files: WorkspaceFsEntry[]) => void;
  const workbench = new WorkspaceChatWorkbench(
    "project",
    null,
    storage,
    () => new Promise((resolve) => (finish = resolve))
  );
  await workbench.activateWorkbench(chat("a"), current);
  const reveal = workbench.open("/brief.md", current);
  await workbench.activateWorkbench(chat("b"), current);
  finish([file("brief.md")]);
  await reveal;
  expect(workbench.readEditorSurfaces().open).toEqual([]);
});

it("opens the latest routed file when an earlier path is still being validated", async () => {
  const { storage } = fixture();
  const reads: ((entries: WorkspaceFsEntry[]) => void)[] = [];
  const workbench = new WorkspaceChatWorkbench(
    "project",
    null,
    storage,
    () => new Promise((resolve) => reads.push(resolve))
  );
  await workbench.activateWorkbench(chat("a"), current);
  workbench.openRoutePath("brief.md");
  await vi.waitFor(() => expect(reads).toHaveLength(1));
  workbench.openRoutePath("plan.svg");
  await vi.waitFor(() => expect(reads).toHaveLength(2));
  reads[0]!([file("brief.md")]);
  reads[1]!([file("plan.svg")]);
  await vi.waitFor(() =>
    expect(workbench.readEditorSurfaces()).toMatchObject({
      open: ["/plan.svg"],
      active: "/plan.svg",
    })
  );
});
