import { describe, expect, it } from "vitest";
import { BrowserAutomationArguments as Arguments } from "./browser-automation-arguments";

const press = (key: string, modifiers: string[] = []) =>
  Arguments.parse("browser_action", {
    target: { kind: "workbench", tabId: "tab" },
    documentId: "document",
    action: { kind: "press", key, modifiers },
  });

describe("browser automation keyboard arguments", () => {
  it.each([
    ["t", ["Meta"]],
    ["w", ["Control"]],
    ["Tab", ["Control", "Shift"]],
    ["ArrowLeft", ["Meta", "Alt"]],
    ["p", ["Meta"]],
    ["i", ["Control", "Shift"]],
    ["v", ["Meta", "Shift"]],
    ["x", ["Control"]],
  ] as const)("refuses the accelerator %s", (key, modifiers) => {
    expect(() => press(key, [...modifiers])).toThrow("reserved_shortcut");
  });

  it("allows ordinary input and in-page editing keys", () => {
    expect(press("Enter")).toMatchObject({ action: { key: "Enter" } });
    expect(press("ArrowRight", ["Shift"])).toMatchObject({
      action: { key: "ArrowRight", modifiers: ["Shift"] },
    });
    expect(press("a", ["Meta"])).toMatchObject({
      action: { key: "a", modifiers: ["Meta"] },
    });
  });
});
