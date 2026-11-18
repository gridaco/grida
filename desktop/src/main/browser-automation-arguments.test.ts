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

describe("browser automation navigation and wait arguments", () => {
  const target = { kind: "background", pageId: "page" };

  it("requires the document guard for navigation except a target-wide stop", () => {
    expect(
      Arguments.parse("browser_navigate", { target, action: { kind: "stop" } })
    ).toMatchObject({ target, action: { kind: "stop" } });
    expect(() =>
      Arguments.parse("browser_navigate", {
        target,
        action: { kind: "reload" },
      })
    ).toThrow("invalid_arguments");
  });

  it("allows 512 Unicode code points for a wait text condition", () => {
    const waitForText = (text: string) =>
      Arguments.parse("browser_wait", {
        target,
        condition: { kind: "text", text },
      });
    const text = "界🙂".repeat(256);
    expect(waitForText(text)).toMatchObject({ condition: { text } });
    expect(() => waitForText(text + "🙂")).toThrow("invalid_arguments");
  });
});
