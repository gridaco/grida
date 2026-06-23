// Browser-mode tests (real Chromium) for the DOM surface's native
// clipboard transport — focus management, the clipboard gate, and the
// copy/cut/paste ClipboardEvent handlers. Contract:
// docs/wg/feat-svg-editor/clipboard.md §Transport.
//
// Events are SYNTHETIC (`new ClipboardEvent(..., { clipboardData })` —
// Chromium honors the init member); they exercise the surface's listeners
// and gates, not the OS clipboard. The real-keystroke / OS-clipboard flow
// is the manual TC (test/svg-editor-clipboard.md).

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

function mount(svg = DOC, opts?: { clipboard?: boolean }) {
  const s = attachSurface(svg, opts);
  surfaces.push(s);
  return s;
}

afterEach(() => {
  for (const s of surfaces) s.dispose();
  surfaces = [];
  for (const n of extra_nodes) n.remove();
  extra_nodes = [];
  document.getSelection()?.removeAllRanges();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

function select_rect(s: AttachedSurface) {
  const id = nodeIdByName(s.editor, "base");
  s.editor.commands.select(id);
  return id;
}

function dispatch_clipboard(
  target: EventTarget,
  kind: "copy" | "cut" | "paste",
  dt = new DataTransfer()
) {
  const e = new ClipboardEvent(kind, {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return { e, dt };
}

describe("focus management", () => {
  it("pointerdown focuses the container (programmatically focusable, not tab-reachable)", () => {
    const s = mount();
    expect(s.container.tabIndex).toBe(-1);
    s.container.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 50,
        clientY: 50,
        button: 0,
      })
    );
    expect(document.activeElement).toBe(s.container);
  });
});

describe("copy / cut over the focused canvas", () => {
  it("copy writes the payload to the event DataTransfer and claims the gesture", () => {
    const s = mount();
    select_rect(s);
    s.container.focus();
    const { e, dt } = dispatch_clipboard(s.container, "copy");
    expect(e.defaultPrevented).toBe(true);
    expect(dt.getData("text/plain")).toBe(
      `<svg xmlns="${SVG_NS}"><rect id="base" x="0" y="0" width="10" height="10"/></svg>`
    );
  });

  it("copy with empty selection leaves the gesture unclaimed (act-then-claim)", () => {
    const s = mount();
    s.container.focus();
    const { e, dt } = dispatch_clipboard(s.container, "copy");
    expect(e.defaultPrevented).toBe(false);
    expect(dt.getData("text/plain")).toBe("");
  });

  it("cut removes the selection, delivers the payload, and one undo restores", () => {
    const s = mount();
    const baseline = s.editor.serialize();
    select_rect(s);
    s.container.focus();
    const { e, dt } = dispatch_clipboard(s.container, "cut");
    expect(e.defaultPrevented).toBe(true);
    expect(dt.getData("text/plain")).toContain(`<rect id="base"`);
    expect(s.editor.serialize()).not.toContain("<rect");
    s.editor.commands.undo();
    expect(s.editor.serialize()).toBe(baseline);
  });
});

describe("the clipboard gate", () => {
  it("does not claim when focus is outside the container — pointer-over is not enough", () => {
    const s = mount();
    select_rect(s);
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.focus();
    const { e } = dispatch_clipboard(document, "copy");
    expect(e.defaultPrevented).toBe(false);
  });

  it("a non-collapsed host text selection wins over copy", () => {
    const s = mount();
    select_rect(s);
    const sibling = document.createElement("div");
    sibling.textContent = "the user's prose";
    document.body.appendChild(sibling);
    extra_nodes.push(sibling);
    s.container.focus();
    document.getSelection()?.selectAllChildren(sibling);
    const { e } = dispatch_clipboard(s.container, "copy");
    expect(e.defaultPrevented).toBe(false);
  });

  it("a focused host text input wins over paste", () => {
    const s = mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    extra_nodes.push(input);
    input.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", `<circle r="1"/>`);
    const { e } = dispatch_clipboard(input, "paste", dt);
    expect(e.defaultPrevented).toBe(false);
    expect(s.editor.serialize()).not.toContain("circle");
  });

  it("clipboard: false opts out of native transport entirely", () => {
    const s = mount(DOC, { clipboard: false });
    select_rect(s);
    s.container.focus();
    const { e, dt } = dispatch_clipboard(s.container, "copy");
    expect(e.defaultPrevented).toBe(false);
    expect(dt.getData("text/plain")).toBe("");
  });
});

describe("paste over the focused canvas", () => {
  it("inserts the delivered markup and selects the roots (claim-then-act)", () => {
    const s = mount();
    s.container.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", `<circle cx="5" cy="5" r="2"/>`);
    const { e } = dispatch_clipboard(s.container, "paste", dt);
    expect(e.defaultPrevented).toBe(true);
    expect(s.editor.serialize()).toContain(`<circle cx="5" cy="5" r="2"/>`);
    expect(s.editor.state.selection).toHaveLength(1);
  });

  it("junk text still claims but mutates nothing (gesture-grade refusal)", () => {
    const s = mount();
    const baseline = s.editor.serialize();
    s.container.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", "not svg at all");
    const { e } = dispatch_clipboard(s.container, "paste", dt);
    expect(e.defaultPrevented).toBe(true);
    expect(s.editor.serialize()).toBe(baseline);
    expect(s.editor.state.can_undo).toBe(false);
  });

  it("an image-only paste (no text/plain) is left unclaimed for the host", () => {
    // The editor transports SVG markup as text; raster-image paste is
    // host-owned (clipboard FRD + image-insertion FRD § Transport). With no
    // text/plain to consider, the handler must NOT preventDefault — else it
    // swallows a paste the host's own listener wants (resolve the blob to an
    // href and call commands.insert_image).
    const s = mount();
    const baseline = s.editor.serialize();
    s.container.focus();
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", {
        type: "image/png",
      })
    );
    const { e } = dispatch_clipboard(s.container, "paste", dt);
    expect(e.defaultPrevented).toBe(false);
    expect(s.editor.serialize()).toBe(baseline);
    expect(s.editor.state.can_undo).toBe(false);
  });
});
