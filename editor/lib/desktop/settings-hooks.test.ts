import { describe, expect, it, vi } from "vitest";
import type {
  DesktopHooks,
  NativeGlobalHookInspection,
} from "@grida/desktop-bridge";
import { SettingsHooks } from "./settings-hooks";

const inspection = (trusted = false): NativeGlobalHookInspection => ({
  configPath: "/users/example/.grida/config.toml",
  exists: true,
  diagnostics: [],
  activation: "new_connections",
  hooks: [
    {
      id: "verify",
      revision: "revision-one",
      source: "config.toml",
      event: "before_completion",
      enabled: true,
      mode: "required",
      executable: "/bin/sh",
      arguments: ["-c", "test -f manifest.json"],
      timeoutMs: 2000,
      trusted,
    },
  ],
});
function native() {
  return {
    inspect: vi.fn<DesktopHooks["inspect"]>().mockResolvedValue(inspection()),
    reload: vi.fn<DesktopHooks["reload"]>().mockResolvedValue(inspection()),
    review: vi.fn<DesktopHooks["review"]>().mockResolvedValue(inspection(true)),
    open_config: vi.fn<DesktopHooks["open_config"]>().mockResolvedValue(),
  };
}

describe("SettingsHooks.Controller", () => {
  it("reports older native hosts without invoking a different configuration path", async () => {
    const controller = new SettingsHooks.Controller(() => undefined);
    await controller.refresh();
    expect(controller.read()).toMatchObject({
      supported: false,
      loading: false,
      inspection: null,
    });
  });
  it("reviews the exact configured revision and accepts the returned trust state", async () => {
    const api = native();
    const controller = new SettingsHooks.Controller(() => api);
    await controller.refresh();
    await controller.review("verify");
    expect(api.review).toHaveBeenCalledExactlyOnceWith(
      "verify",
      "revision-one"
    );
    expect(controller.read().inspection?.hooks[0].trusted).toBe(true);
    await controller.review("verify");
    expect(api.review).toHaveBeenCalledOnce();
  });
  it("keeps configuration when trust review is cancelled", async () => {
    const api = native();
    api.review.mockResolvedValue(null);
    const controller = new SettingsHooks.Controller(() => api);
    await controller.refresh();
    await controller.review("verify");
    expect(controller.read().inspection?.hooks[0].trusted).toBe(false);
    expect(controller.read().error).toBeNull();
  });
  it("keeps the previous inspection when a reload fails", async () => {
    const api = native();
    api.reload.mockRejectedValue(new Error("invalid config"));
    const controller = new SettingsHooks.Controller(() => api);
    await controller.refresh();
    await controller.reload();
    expect(controller.read().inspection).toEqual(inspection());
    expect(controller.read()).toMatchObject({
      loading: false,
      action: null,
      error: "Couldn't read config.toml.",
    });
  });
  it.each([
    { outcome: "opens", openerFailed: false },
    { outcome: "fails to open", openerFailed: true },
  ])("reports the created file when it $outcome", async ({ openerFailed }) => {
    const api = native();
    api.inspect.mockResolvedValueOnce({ ...inspection(), exists: false });
    if (openerFailed)
      api.open_config.mockRejectedValueOnce(new Error("no default app"));
    const controller = new SettingsHooks.Controller(() => api);
    await controller.refresh();
    expect(controller.read().inspection?.exists).toBe(false);

    await controller.openConfig();

    expect(api.open_config).toHaveBeenCalledOnce();
    expect(controller.read().inspection?.exists).toBe(true);
    expect(controller.read().error).toBe(
      openerFailed ? "Couldn't open config.toml." : null
    );
  });
  it("clears the previous file state when a fresh inspection fails", async () => {
    const api = native();
    const controller = new SettingsHooks.Controller(() => api);
    await controller.refresh();
    expect(controller.read().inspection?.exists).toBe(true);
    api.inspect.mockRejectedValueOnce(new Error("inspection unavailable"));

    await controller.refresh();

    expect(controller.read()).toMatchObject({
      inspection: null,
      loading: false,
      error: "Couldn't read config.toml.",
    });
  });
  it("ignores an inspection that settles after the panel is disposed", async () => {
    let settle!: (value: NativeGlobalHookInspection) => void;
    const api = native();
    api.inspect.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const controller = new SettingsHooks.Controller(() => api);
    const pending = controller.refresh();
    await controller.refresh();
    expect(api.inspect).toHaveBeenCalledOnce();
    controller.cancel();
    settle(inspection());
    await pending;
    expect(controller.read().inspection).toBeNull();
  });
});
