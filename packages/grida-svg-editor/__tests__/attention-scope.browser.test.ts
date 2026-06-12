// Browser-mode tests (real Chromium) for the host-extendable attention
// scope (`handle.attention`). The scenario under contract: a floating
// host inspector — a DOM SIBLING of the container (the container is
// exclusively surface-owned), visually overlapping the canvas — drives
// `commands.*` from its buttons. Clicking such a button moves focus out
// of the container, so without registration every keystroke (undo /
// delete / tool keys) is ignored until the user re-attends the canvas.
// Registering the chrome element keeps the full keymap live; `remove()`
// restores the default blackout.
//
// Key choice: Backspace → `selection.remove` — modifier-free, so the
// assertions are platform-independent (no CtrlCmd resolution).

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSurface,
  nodeIdByName,
  type AttachedSurface,
} from "./_browser-helpers";

const SVG_NS = "http://www.w3.org/2000/svg";
const DOC = `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100"><rect id="base" x="0" y="0" width="10" height="10"/></svg>`;

let surfaces: AttachedSurface[] = [];
let extra_nodes: Element[] = [];

function mount(svg = DOC) {
  const s = attachSurface(svg);
  surfaces.push(s);
  return s;
}

/** Floating sibling chrome with one focusable button — the minimal
 *  inspector shape. Overlaps the container (position: fixed). */
function mount_chrome(): { chrome: HTMLDivElement; button: HTMLButtonElement } {
  const chrome = document.createElement("div");
  Object.assign(chrome.style, {
    position: "fixed",
    right: "0px",
    top: "0px",
    width: "200px",
    height: "300px",
  });
  const button = document.createElement("button");
  button.textContent = "chrome action";
  chrome.appendChild(button);
  document.body.appendChild(chrome);
  extra_nodes.push(chrome);
  return { chrome, button };
}

afterEach(() => {
  for (const s of surfaces) s.dispose();
  surfaces = [];
  for (const n of extra_nodes) n.remove();
  extra_nodes = [];
  document.getSelection()?.removeAllRanges();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

function press_backspace(target: EventTarget) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Backspace",
      code: "Backspace",
      bubbles: true,
      cancelable: true,
    })
  );
}

function has_rect(s: AttachedSurface): boolean {
  return [...s.editor.tree().nodes.values()].some((n) => n.tag === "rect");
}

describe("handle.attention — keymap arm", () => {
  it("focus on unregistered sibling chrome blacks out the keymap (the default, unchanged)", () => {
    const s = mount();
    const { button } = mount_chrome();
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    button.focus();
    press_backspace(button);
    expect(has_rect(s)).toBe(true); // keystroke ignored — not attended
  });

  it("focus on REGISTERED chrome keeps the keymap live — Backspace deletes the selection", () => {
    const s = mount();
    const { chrome, button } = mount_chrome();
    s.handle.attention.add(chrome);
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    button.focus();
    press_backspace(button);
    expect(has_rect(s)).toBe(false);
  });

  it("pointer over registered chrome (body focus) attends the keymap", () => {
    const s = mount();
    const { chrome } = mount_chrome();
    s.handle.attention.add(chrome);
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    (document.activeElement as HTMLElement | null)?.blur?.();
    chrome.dispatchEvent(new PointerEvent("pointerenter"));
    press_backspace(document);
    expect(has_rect(s)).toBe(false);
  });

  it("remove() restores the blackout", () => {
    const s = mount();
    const { chrome, button } = mount_chrome();
    s.handle.attention.add(chrome);
    s.handle.attention.remove(chrome);
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    button.focus();
    press_backspace(button);
    expect(has_rect(s)).toBe(true);
  });

  it("a text input inside registered chrome still wins — the keymap does not steal its Backspace", () => {
    const s = mount();
    const { chrome } = mount_chrome();
    const input = document.createElement("input");
    input.type = "text";
    chrome.appendChild(input);
    s.handle.attention.add(chrome);
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    input.focus();
    press_backspace(input);
    expect(has_rect(s)).toBe(true); // text-input guard intact
  });
});

describe("handle.attention — clipboard arm (focus-only)", () => {
  function dispatch_copy(): DataTransfer {
    const dt = new DataTransfer();
    document.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
    );
    return dt;
  }

  it("copy claims when focus is inside registered chrome", () => {
    const s = mount();
    const { chrome, button } = mount_chrome();
    s.handle.attention.add(chrome);
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    button.focus();
    const dt = dispatch_copy();
    expect(dt.getData("text/plain")).toContain("<rect");
  });

  it("pointer-over registered chrome alone does NOT claim copy — stricter gate preserved", () => {
    const s = mount();
    const { chrome } = mount_chrome();
    s.handle.attention.add(chrome);
    s.editor.commands.select(nodeIdByName(s.editor, "base"));
    (document.activeElement as HTMLElement | null)?.blur?.();
    chrome.dispatchEvent(new PointerEvent("pointerenter"));
    const dt = dispatch_copy();
    expect(dt.getData("text/plain")).toBe("");
  });
});
