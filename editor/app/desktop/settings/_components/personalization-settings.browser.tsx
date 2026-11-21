import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type {
  DesktopBridge,
  DesktopPersonalizationSettings,
} from "@grida/desktop-bridge";
import { PersonalizationSettings } from "./personalization-settings";
import "@/app/ui.css";

let root: Root;
async function mount(props: Parameters<typeof PersonalizationSettings>[0]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("main");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PersonalizationSettings {...props} />));
}
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("persists each chat preference, reflects an external edit, and restores it on reopen", async () => {
  let value: DesktopPersonalizationSettings = {
    suggestedPrompts: false,
    webSearch: "live",
    revision: 0,
  };
  const listeners = new Set<(value: DesktopPersonalizationSettings) => void>();
  const api: NonNullable<DesktopBridge["personalization"]> = {
    get: async () => value,
    set: async (change) => {
      const requested =
        "webSearch" in change && change.webSearch === "onDemand"
          ? { webSearch: "disabled" as const }
          : change;
      value = { ...value, ...requested, revision: value.revision + 1 };
      for (const listener of listeners) listener(value);
      return value;
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  await mount({ api });
  const suggestions = page.getByRole("switch", { name: "Suggested prompts" });
  const search = page.getByRole("switch", { name: "Web search" });
  await expect
    .element(page.getByRole("switch", { name: "Fast mode" }))
    .not.toBeInTheDocument();
  await act(() => suggestions.click());
  await expect.element(search).toBeChecked();
  await act(() => search.click());
  await expect.element(search).not.toBeChecked();
  expect(value.webSearch).toBe("disabled");
  await act(() => search.click());
  await expect.element(search).toBeChecked();
  expect(value.webSearch).toBe("live");

  expect(value.suggestedPrompts).toBe(true);
  await act(async () => {
    await api.set({ webSearch: "disabled" });
  });
  await expect.element(search).not.toBeChecked();
  act(() => root.unmount());
  expect(listeners.size).toBe(0);
  await mount({ api });
  await expect.element(suggestions).toBeChecked();
  await expect.element(search).not.toBeChecked();
  expect(value.webSearch).toBe("disabled");

  await act(async () => {
    await api.set({ webSearch: "live" });
  });
  await expect.element(search).toBeChecked();
});

it("keeps Suggested prompts usable on a Desktop build with just the predictions bridge", async () => {
  const set = vi.fn<NonNullable<DesktopBridge["composerPredictions"]>["set"]>(
    async (enabled) => ({ enabled, revision: 1 })
  );
  await mount({
    legacyPredictions: {
      get: async () => ({ enabled: false, revision: 0 }),
      set,
      onChange: () => () => {},
    },
  });
  const suggestions = page.getByRole("switch", { name: "Suggested prompts" });
  await expect.element(suggestions).toBeEnabled();
  await act(() => suggestions.click());
  expect(set).toHaveBeenCalledWith(true);
  await expect.element(suggestions).toBeChecked();
  await expect
    .element(page.getByRole("switch", { name: "Web search" }))
    .not.toBeInTheDocument();
});

it("opens the Personalization category for a saved Chat settings link", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("grida", {
    protocol: 1,
    window: {},
    app: { version: "0.8.0", platform: "darwin" },
    personalization: {
      get: async () => ({
        suggestedPrompts: false,
        webSearch: "disabled",
        revision: 0,
      }),
      onChange: () => () => {},
    },
  });
  const previous = window.location.hash;
  try {
    await page.viewport(1060, 720);
    window.history.replaceState(null, "", "#chat");
    const { default: DesktopSettingsPage } = await import("../page");
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<DesktopSettingsPage />));
    await expect
      .element(page.getByRole("tab", { name: "Personalization" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByRole("heading", { name: "Personalization" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("switch", { name: "Web search" }))
      .toBeEnabled();
  } finally {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + previous
    );
  }
});
