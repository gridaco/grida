import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "@grida/desktop-bridge";
import {
  BYOK_PROVIDER_METADATA,
  DESKTOP_BRIDGE_PROTOCOL,
  getDesktopBridge,
  getDesktopBridgeStatus,
  secrets,
} from "./bridge";

function installBridge(bridge: Record<string, unknown>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: bridge,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
});

describe("desktop bridge client contract", () => {
  it("rejects a missing or unsupported bridge protocol", () => {
    installBridge({});
    expect(getDesktopBridge()).toBeNull();

    installBridge({ grida: { protocol: 0 } as unknown as DesktopBridge });
    expect(getDesktopBridge()).toBeNull();
    expect(getDesktopBridgeStatus()).toEqual({
      kind: "unsupported",
      protocol: 0,
    });
  });

  it("accepts the current bridge protocol", () => {
    const bridge = {
      protocol: DESKTOP_BRIDGE_PROTOCOL,
    } as unknown as DesktopBridge;
    installBridge({ grida: bridge });

    expect(getDesktopBridge()).toBe(bridge);
    expect(getDesktopBridgeStatus()).toEqual({ kind: "ready", bridge });
  });

  it("uses producer-owned BYOK provider metadata for settings", () => {
    expect(secrets.byokProviderMetadata()).toBe(BYOK_PROVIDER_METADATA);
    expect(secrets.byokProviders()).toEqual(["openrouter", "ai-gateway"]);
  });

  it("rejects empty keys before calling the bridge", async () => {
    const set = vi.fn();
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        secrets: { set },
      } as unknown as DesktopBridge,
    });

    await expect(secrets.setKey("openrouter", "   ")).rejects.toThrow(
      "Key cannot be empty."
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("confirms deletes through the destructive native dialog", async () => {
    const confirm = vi.fn().mockResolvedValue(0);
    installBridge({
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        dialog: { confirm },
      } as unknown as DesktopBridge,
    });

    await expect(secrets.confirmDeleteKey("openrouter")).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith({
      message: "Remove OpenRouter key?",
      detail:
        "The desktop app will stop using this key. You can add it back any time.",
      buttons: ["Remove", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it("does not expose a secret read path", () => {
    expect("get" in secrets).toBe(false);
  });
});
