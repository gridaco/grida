import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerContent, ComposerProvider } from "./composer-react";
import { ComposerDropArea } from "./composer-drop-area";
import type { ComposerTransfer } from "./composer-transfer";

// Real Chromium drag events against the real composer editor: the whole
// surface accepts a file drop, and a drop on the editor is handled once.
describe("ComposerDropArea in a browser", () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
  });

  async function setup() {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const pane = vi.fn<(event: ComposerTransfer.Event) => void>();
    const composer = vi.fn<(event: ComposerTransfer.Event) => void>();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <ComposerProvider catalog={{ commands: [], mentions: [] }}>
          <ComposerDropArea
            data-testid="surface"
            onTransfer={pane}
            style={{ width: 400, height: 400 }}
          >
            <p data-testid="transcript" style={{ height: 200, margin: 0 }}>
              transcript
            </p>
            <ComposerContent onTransfer={composer} placeholder="Compose" />
          </ComposerDropArea>
        </ComposerProvider>
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector("[data-composer-editor]")).not.toBeNull();
    });
    const surface = container.querySelector<HTMLElement>(
      '[data-testid="surface"]'
    )!;
    const transcript = container.querySelector<HTMLElement>(
      '[data-testid="transcript"]'
    )!;
    const editor = container.querySelector<HTMLElement>(
      "[data-composer-editor]"
    )!;
    return { surface, transcript, editor, pane, composer };
  }

  function files(...list: File[]): DataTransfer {
    const data = new DataTransfer();
    for (const file of list) data.items.add(file);
    return data;
  }

  function fire(target: HTMLElement, type: string, data: DataTransfer) {
    const rect = target.getBoundingClientRect();
    const event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
      clientX: rect.left + 4,
      clientY: rect.top + 4,
    });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  }

  const overlay = (surface: HTMLElement) =>
    surface.querySelector("[data-composer-drop-overlay]");

  it("highlights while a file drag is over any child and forwards a drop outside the editor", async () => {
    const { surface, transcript, pane, composer } = await setup();
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const data = files(file);

    fire(surface, "dragenter", data);
    fire(transcript, "dragenter", data);
    fire(surface, "dragleave", data);
    expect(overlay(surface)).not.toBeNull();
    expect(overlay(surface)!.getAttribute("aria-hidden")).toBe("true");

    const drop = fire(transcript, "drop", data);
    expect(drop.defaultPrevented).toBe(true);
    expect(overlay(surface)).toBeNull();
    expect(composer).not.toHaveBeenCalled();
    expect(pane).toHaveBeenCalledTimes(1);
    expect(pane.mock.calls[0][0].resources).toEqual([{ kind: "file", file }]);
  });

  it("handles a drop on the composer editor exactly once", async () => {
    const { surface, editor, pane, composer } = await setup();
    const data = files(new File(["hello"], "notes.txt"));

    fire(editor, "dragenter", data);
    expect(overlay(surface)).not.toBeNull();
    fire(editor, "drop", data);
    expect(composer).toHaveBeenCalledTimes(1);
    expect(pane).not.toHaveBeenCalled();
    expect(overlay(surface)).toBeNull();
  });

  it("ignores a text drag", async () => {
    const { surface, transcript, pane } = await setup();
    const data = new DataTransfer();
    data.setData("text/plain", "words");
    fire(transcript, "dragenter", data);
    expect(overlay(surface)).toBeNull();
    const drop = fire(transcript, "drop", data);
    expect(drop.defaultPrevented).toBe(false);
    expect(pane).not.toHaveBeenCalled();
  });
});
