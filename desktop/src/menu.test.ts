// GRIDA-SEC-004 — opening a recent workspace revalidates its registered root.
import type {
  App,
  MenuItem,
  MenuItemConstructorOptions,
  Shell,
} from "electron";
import type { Workspace } from "@grida/daemon";
import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  template: [] as MenuItemConstructorOptions[],
  open: vi.fn<(options: { workspace_id: string }) => object>(() => ({})),
  reopen: vi.fn<(root: string) => Promise<Workspace>>(),
  list: vi.fn<() => Promise<Workspace[]>>(),
  error: vi.fn<(title: string, message: string) => void>(),
}));

vi.mock("electron", () => ({
  Menu: {
    getApplicationMenu: () => null,
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => template,
    setApplicationMenu: (template: MenuItemConstructorOptions[]) => {
      fixture.template = template;
    },
  },
  dialog: { showErrorBox: fixture.error },
}));
vi.mock("./window", () => ({ open_workspace_window: fixture.open }));
vi.mock("./env", () => ({ EDITOR_BASE_URL: "https://fixture.invalid" }));
vi.mock("./main/agent-sidecar-supervisor", () => ({
  getAgentSidecarInfo: () => ({}),
}));
vi.mock("./main/agent-sidecar-client", () => ({
  agentSidecarClient: {
    listWorkspaces: fixture.list,
    reopenWorkspace: fixture.reopen,
  },
}));
vi.mock("./main/window-focus", () => ({ focusWindowByUrl: () => false }));

import { rebuild_application_menu } from "./menu";

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
