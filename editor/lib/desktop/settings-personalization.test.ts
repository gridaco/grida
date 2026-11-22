import { expect, it, vi } from "vitest";
import type {
  DesktopPersonalizationSettings,
  DesktopPersonalizationChange,
} from "@grida/desktop-bridge";
import { SettingsPersonalization } from "./settings-personalization";

const defaults = { webSearch: "disabled" } as const;

it("preserves a newer global change when a delayed read or save resolves", async () => {
  const read = Promise.withResolvers<DesktopPersonalizationSettings>();
  const write = Promise.withResolvers<DesktopPersonalizationSettings>();
  let notify!: (value: DesktopPersonalizationSettings) => void;
  const unsubscribe = vi.fn<() => void>();
  const api = {
    get: () => read.promise,
    set: vi.fn<
      (
        change: DesktopPersonalizationChange
      ) => Promise<DesktopPersonalizationSettings>
    >(() => write.promise),
    onChange: (listener: typeof notify) => {
      notify = listener;
      return unsubscribe;
    },
  };
  const settings = new SettingsPersonalization(api);
  const disconnect = settings.connect();
  notify({ ...defaults, suggestedPrompts: false, revision: 2 });
  read.resolve({ ...defaults, suggestedPrompts: true, revision: 1 });
  await read.promise;
  expect(settings.read().preference?.suggestedPrompts).toBe(false);
  const saving = settings.set({ suggestedPrompts: true });
  notify({ ...defaults, suggestedPrompts: false, revision: 4 });
  write.resolve({ ...defaults, suggestedPrompts: true, revision: 3 });
  await saving;
  expect(api.set).toHaveBeenCalledWith({ suggestedPrompts: true });
  expect(settings.read()).toMatchObject({
    preference: { ...defaults, suggestedPrompts: false, revision: 4 },
    saving: false,
    error: "",
  });
  disconnect();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("shows read or persistence failures and lets the corrected file be reloaded", async () => {
  const read = vi.fn<() => Promise<DesktopPersonalizationSettings>>();
  read.mockRejectedValueOnce(Error());
  read.mockResolvedValue({ ...defaults, suggestedPrompts: true, revision: 1 });
  const settings = new SettingsPersonalization({
    get: read,
    set: async () => {
      throw Error();
    },
    onChange: () => () => {},
  });
  await settings.refresh();
  expect(settings.read().error).toContain("read");
  await settings.refresh();
  expect(settings.read().error).toBe("");
  await settings.set({ suggestedPrompts: false });
  expect(settings.read()).toMatchObject({
    preference: { ...defaults, suggestedPrompts: true },
    saving: false,
    error: expect.stringMatching(/save/),
  });
});

it.each(["focus", "change"])(
  "keeps settings visible when an old read fails after a successful %s update",
  async (source) => {
    const first = Promise.withResolvers<DesktopPersonalizationSettings>();
    const current = { ...defaults, suggestedPrompts: true, revision: 2 };
    const get = vi.fn<() => Promise<DesktopPersonalizationSettings>>();
    get.mockReturnValueOnce(first.promise);
    get.mockResolvedValue(current);
    let notify!: (value: DesktopPersonalizationSettings) => void;
    const settings = new SettingsPersonalization({
      get,
      set: async () => current,
      onChange: (listener) => {
        notify = listener;
        return () => {};
      },
    });
    const disconnect = settings.connect();
    if (source === "focus") await settings.refresh();
    else notify(current);
    first.reject(new Error("personalization_unavailable"));
    await first.promise.catch(() => {});
    expect(settings.read()).toMatchObject({
      preference: current,
      unavailable: false,
      error: "",
    });
    disconnect();
  }
);

it("reports native chat unavailability without suggesting changes to the file", async () => {
  const settings = new SettingsPersonalization({
    get: async () => {
      throw Error(
        "Error invoking remote method 'grida:personalization:get': Error: personalization_unavailable"
      );
    },
    set: vi.fn<
      (
        change: DesktopPersonalizationChange
      ) => Promise<DesktopPersonalizationSettings>
    >(),
    onChange: () => () => {},
  });
  await settings.refresh();
  expect(settings.read()).toMatchObject({
    preference: null,
    unavailable: true,
    error: "",
  });
});
