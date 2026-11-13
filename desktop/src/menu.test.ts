// GRIDA-SEC-004 — opening a recent workspace revalidates its registered root.
import type {
  App,
  MenuItem,
  MenuItemConstructorOptions,
  Shell,
} from "electron";
import type { Workspace } from "@grida/daemon";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  template: [] as MenuItemConstructorOptions[],
  open: vi.fn<(options: { workspace_id: string }) => object>(() => ({})),
  deck: vi.fn<(options: { workspace_id: string }) => object>(() => ({})),
  openWorkspace: vi.fn<(root: string) => Promise<Workspace>>(),
  reopen: vi.fn<(root: string) => Promise<Workspace>>(),
  list: vi.fn<() => Promise<Workspace[]>>(),
  error: vi.fn<(title: string, message: string) => void>(),
  picker: vi.fn<() => Promise<{ canceled: boolean; filePaths: string[] }>>(),
  sidecarReady: true,
}));

vi.mock("electron", () => ({
  Menu: {
    getApplicationMenu: () =>
      fixture.template.length ? fixture.template : null,
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => template,
    setApplicationMenu: (template: MenuItemConstructorOptions[]) => {
      fixture.template = template;
    },
  },
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showErrorBox: fixture.error, showOpenDialog: fixture.picker },
}));
vi.mock("./window", () => ({
  open_workspace_window: fixture.open,
  open_canvas_window: fixture.deck,
}));
vi.mock("./env", () => ({ EDITOR_BASE_URL: "https://fixture.invalid" }));
vi.mock("./main/agent-sidecar-supervisor", () => ({
  getAgentSidecarInfo: () => (fixture.sidecarReady ? {} : null),
}));
vi.mock("./main/agent-sidecar-client", () => ({
  agentSidecarClient: {
    listWorkspaces: fixture.list,
    openWorkspace: fixture.openWorkspace,
    reopenWorkspace: fixture.reopen,
  },
}));
vi.mock("./main/window-focus", () => ({ focusWindowByUrl: () => false }));

import { rebuild_application_menu } from "./menu";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.template = [];
  fixture.list.mockResolvedValue([]);
  fixture.sidecarReady = true;
});

it("waits for a recent root to reopen and refuses a replaced root", async () => {
  const workspace = {
    id: "exact",
    root: "/fixture/recent-workspace",
    name: "Recent fixture",
  } as Workspace;
  fixture.list.mockResolvedValue([workspace]);
  const admission = {
    can_open: () => true,
    register: () => true,
    focus_entry: () => {},
  };
  await rebuild_application_menu(
    { name: "Grida fixture" } as App,
    {} as Shell,
    { windowAdmission: admission }
  );
  const file = fixture.template.find((item) => item.label === "File")!;
  const recent = (file.submenu as MenuItemConstructorOptions[]).find(
    (item) => item.label === "Open Recent"
  )!;
  const entry = (recent.submenu as MenuItemConstructorOptions[])[0];
  const pending = Promise.withResolvers<Workspace>();
  fixture.reopen.mockReturnValueOnce(pending.promise);
  entry.click!({} as MenuItem, undefined, {} as Electron.KeyboardEvent);
  await vi.waitFor(() =>
    expect(fixture.reopen).toHaveBeenCalledWith(workspace.root)
  );
  expect(fixture.open).not.toHaveBeenCalled();
  pending.resolve(workspace);
  await vi.waitFor(() =>
    expect(fixture.open).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: workspace.id })
    )
  );

  fixture.reopen.mockRejectedValueOnce(new Error("workspace_not_registered"));
  entry.click!({} as MenuItem, undefined, {} as Electron.KeyboardEvent);
  await vi.waitFor(() =>
    expect(fixture.error).toHaveBeenCalledWith(
      "Couldn't reopen project",
      expect.stringContaining("Open Folder")
    )
  );
  expect(fixture.open).toHaveBeenCalledTimes(1);
});

it("opens a native SVG during a sidecar restart and declines unowned files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-menu-svg-"));
  const svg = path.join(root, "drawing.svg");
  const unsupported = path.join(root, "unsupported.txt");
  const legacy = path.join(root, "legacy.grida");
  fixture.sidecarReady = false;
  let admitted = true;
  let native = true;
  const onOpenFile = vi.fn<(filename: string) => void>();
  const focus = vi.fn<() => void>();
  const admission = {
    can_open: () => admitted,
    register: () => true,
    focus_entry: focus,
    native_file_available: (filename?: string) =>
      native && (filename === undefined || filename === svg),
  };
  try {
    for (const file of [svg, unsupported, legacy])
      await fs.writeFile(file, "fixture");
    await rebuild_application_menu(
      { name: "Grida fixture" } as App,
      {} as Shell,
      { onOpenFile, windowAdmission: admission }
    );
    const open = fileMenuItem(
      process.platform === "darwin" ? "Open…" : "Open File…"
    );
    fixture.picker.mockResolvedValueOnce({ canceled: false, filePaths: [svg] });
    click(open);
    await vi.waitFor(() =>
      expect(onOpenFile).toHaveBeenCalledExactlyOnceWith(svg)
    );

    for (const filename of [unsupported, legacy]) {
      fixture.picker.mockResolvedValueOnce({
        canceled: false,
        filePaths: [filename],
      });
      click(open);
    }
    await Promise.resolve();
    expect(fixture.picker).toHaveBeenCalledTimes(3);
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(fixture.openWorkspace).not.toHaveBeenCalled();

    const pending = Promise.withResolvers<{
      canceled: boolean;
      filePaths: string[];
    }>();
    fixture.picker.mockReturnValueOnce(pending.promise);
    click(open);
    expect(fixture.picker).toHaveBeenCalledTimes(4);
    admitted = false;
    pending.resolve({ canceled: false, filePaths: [svg] });
    await Promise.resolve();
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    click(open);
    expect(focus).toHaveBeenCalledOnce();
    expect(fixture.picker).toHaveBeenCalledTimes(4);

    admitted = true;
    native = false;
    click(open);
    expect(fixture.picker).toHaveBeenCalledTimes(4);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it("opens and reopens an admitted native deck while compatibility is unavailable", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-menu-deck-"));
  const bundle = path.join(root, "Launch.canvas");
  const workspace = {
    id: "native-deck",
    root: bundle,
    name: "Launch",
  } as Workspace;
  fixture.sidecarReady = false;
  const owner = {
    list: vi.fn<() => Promise<Workspace[]>>().mockResolvedValue([workspace]),
    openSelected: vi
      .fn<(root: string) => Promise<Workspace>>()
      .mockResolvedValue(workspace),
    reopen: vi
      .fn<(root: string) => Promise<Workspace>>()
      .mockResolvedValue(workspace),
  };
  try {
    await fs.mkdir(bundle);
    await fs.writeFile(path.join(bundle, ".canvas.json"), "{}");
    const app = {
      name: "Grida fixture",
      addRecentDocument: vi.fn<(filename: string) => void>(),
    } as unknown as App;
    await rebuild_application_menu(app, {} as Shell, {
      windowAdmission: {
        can_open: () => true,
        register: () => true,
        focus_entry: () => {},
        native_workspaces: () => owner,
      },
    });
    expect(owner.list).toHaveBeenCalledOnce();
    fixture.picker.mockResolvedValueOnce({
      canceled: false,
      filePaths: [bundle],
    });
    click(
      fileMenuItem(process.platform === "darwin" ? "Open…" : "Open Folder…")
    );
    await vi.waitFor(() => expect(fixture.deck).toHaveBeenCalledTimes(1));
    expect(owner.openSelected).toHaveBeenCalledExactlyOnceWith(bundle);
    expect(app.addRecentDocument).toHaveBeenCalledExactlyOnceWith(bundle);
    click(
      (fileMenuItem("Open Recent").submenu as MenuItemConstructorOptions[])[0]
    );
    await vi.waitFor(() => expect(fixture.deck).toHaveBeenCalledTimes(2));
    expect(owner.reopen).toHaveBeenCalledExactlyOnceWith(bundle);
    expect(fixture.list).not.toHaveBeenCalled();
    expect(fixture.openWorkspace).not.toHaveBeenCalled();
    expect(fixture.reopen).not.toHaveBeenCalled();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function fileMenuItem(label: string): MenuItemConstructorOptions {
  const file = fixture.template.find((item) => item.label === "File")!;
  return (file.submenu as MenuItemConstructorOptions[]).find(
    (item) => item.label === label
  )!;
}

function click(item: MenuItemConstructorOptions): void {
  item.click!({} as MenuItem, undefined, {} as Electron.KeyboardEvent);
}
