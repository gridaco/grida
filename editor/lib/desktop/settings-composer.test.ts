import { expect, it, vi } from "vitest";
import type { DesktopComposerPredictionSettings } from "@grida/desktop-bridge";
import { SettingsComposer } from "./settings-composer";

it("preserves a newer global change when a delayed read or save resolves", async () => {
  const read = Promise.withResolvers<DesktopComposerPredictionSettings>();
  const write = Promise.withResolvers<DesktopComposerPredictionSettings>();
  let notify!: (value: DesktopComposerPredictionSettings) => void;
  const unsubscribe = vi.fn<() => void>();
  const api = {
    get: () => read.promise,
    set: vi.fn<
      (enabled: boolean) => Promise<DesktopComposerPredictionSettings>
    >(() => write.promise),
    onChange: (listener: typeof notify) => {
      notify = listener;
      return unsubscribe;
    },
  };
  const settings = new SettingsComposer(api);
  const disconnect = settings.connect();
  notify({ enabled: false, revision: 2 });
  read.resolve({ enabled: true, revision: 1 });
  await read.promise;
  expect(settings.read().preference?.enabled).toBe(false);
  const saving = settings.set(true);
  notify({ enabled: false, revision: 4 });
  write.resolve({ enabled: true, revision: 3 });
  await saving;
  expect(api.set).toHaveBeenCalledWith(true);
  expect(settings.read()).toMatchObject({
    preference: { enabled: false, revision: 4 },
    saving: false,
    error: "",
  });
  disconnect();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("shows read or persistence failures and lets the corrected file be reloaded", async () => {
  const read = vi.fn<() => Promise<DesktopComposerPredictionSettings>>();
  read.mockRejectedValueOnce(Error());
  read.mockResolvedValue({ enabled: true, revision: 1 });
  const settings = new SettingsComposer({
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
  await settings.set(false);
  expect(settings.read()).toMatchObject({
    preference: { enabled: true },
    saving: false,
    error: expect.stringMatching(/save/),
  });
});

it("reports native chat unavailability without suggesting changes to the file", async () => {
  const settings = new SettingsComposer({
    get: async () => {
      throw Error(
        "Error invoking remote method 'grida:composer-predictions:get': Error: composer_predictions_unavailable"
      );
    },
    set: vi.fn<
      (enabled: boolean) => Promise<DesktopComposerPredictionSettings>
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
