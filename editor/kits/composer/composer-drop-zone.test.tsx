import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerDropZone } from "./composer-drop-zone";
import { ComposerDropArea, ComposerDropOverlay } from "./composer-drop-area";
import type { ComposerTransfer } from "./composer-transfer";

function fileItem(file: File, directory = false): DataTransferItem {
  return {
    kind: "file",
    type: file.type,
    getAsFile: () => file,
    webkitGetAsEntry: () => ({ isDirectory: directory }),
  } as unknown as DataTransferItem;
}

function osFiles(...files: File[]): DataTransfer {
  return {
    types: ["Files"],
    files,
    items: files.map((file) => fileItem(file)),
    dropEffect: "none",
  } as unknown as DataTransfer;
}

function textDrag(): DataTransfer {
  return {
    types: ["text/plain", "text/html"],
    files: [],
    items: [],
    dropEffect: "none",
  } as unknown as DataTransfer;
}

function drag(type: string, dataTransfer: DataTransfer | null): Event {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  return event;
}

function fixture() {
  const received: ComposerTransfer.Event[] = [];
  const zone = new ComposerDropZone((event) => received.push(event));
  const surface = new EventTarget();
  const window = new EventTarget();
  const disconnect = zone.connect(surface, window);
  return { zone, surface, window, received, disconnect };
}

describe("ComposerDropZone", () => {
  it("stays active while an OS file drag moves across child elements", () => {
    const { zone, surface } = fixture();
    const data = osFiles(new File(["a"], "a.txt"));
    const changes = vi.fn<() => void>();
    zone.subscribe(changes);

    surface.dispatchEvent(drag("dragenter", data)); // pane
    expect(zone.getSnapshot()).toBe(true);
    surface.dispatchEvent(drag("dragenter", data)); // transcript child
    surface.dispatchEvent(drag("dragleave", data)); // leaves pane for child
    expect(zone.getSnapshot()).toBe(true);
    surface.dispatchEvent(drag("dragenter", data)); // header child
    surface.dispatchEvent(drag("dragleave", data)); // leaves transcript
    expect(zone.getSnapshot()).toBe(true);
    surface.dispatchEvent(drag("dragleave", data)); // leaves the pane
    expect(zone.getSnapshot()).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("accepts the drag so the browser allows dropping anywhere on the surface", () => {
    const { surface } = fixture();
    const data = osFiles(new File(["a"], "a.txt"));
    const over = drag("dragover", data);
    surface.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(data.dropEffect).toBe("copy");
  });

  it("ignores drags without OS files", () => {
    const { zone, surface, received } = fixture();
    const enter = drag("dragenter", textDrag());
    const over = drag("dragover", textDrag());
    const drop = drag("drop", textDrag());
    surface.dispatchEvent(enter);
    surface.dispatchEvent(over);
    expect(zone.getSnapshot()).toBe(false);
    surface.dispatchEvent(drop);
    expect(enter.defaultPrevented).toBe(false);
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(received).toEqual([]);
  });

  it("ignores drags that started inside the document, even when they advertise Files", () => {
    const { zone, surface, window, received } = fixture();
    // Chromium lists "Files" for an in-page image drag.
    const data = osFiles(new File(["a"], "a.png", { type: "image/png" }));
    window.dispatchEvent(new Event("dragstart"));
    surface.dispatchEvent(drag("dragenter", data));
    expect(zone.getSnapshot()).toBe(false);
    const drop = drag("drop", data);
    surface.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(false);
    expect(received).toEqual([]);

    // Once that drag ends, OS file drags are accepted again.
    window.dispatchEvent(new Event("dragend"));
    surface.dispatchEvent(drag("dragenter", data));
    expect(zone.getSnapshot()).toBe(true);
  });

  it("forwards a drop through the composer transfer intake and clears the highlight", () => {
    const { zone, surface, received } = fixture();
    const file = new File(["a"], "a.txt", { type: "text/plain" });
    const data = osFiles(file);
    surface.dispatchEvent(drag("dragenter", data));
    surface.dispatchEvent(drag("dragenter", data));
    const drop = drag("drop", data);
    surface.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(zone.getSnapshot()).toBe(false);
    expect(received).toEqual([
      { source: "drop", resources: [{ kind: "file", file }] },
    ]);
    expect(received[0].resources[0].file).toBe(file);
  });

  it("forwards every dropped resource unchanged so the host's policy decides", () => {
    const { surface, received } = fixture();
    const folder = new File([], "refs");
    const file = new File(["a"], "a.txt");
    const data = {
      types: ["Files"],
      files: [folder, file],
      items: [fileItem(folder, true), fileItem(file)],
    } as unknown as DataTransfer;
    surface.dispatchEvent(drag("drop", data));
    expect(received).toEqual([
      {
        source: "drop",
        resources: [
          { kind: "directory", file: folder },
          { kind: "file", file },
        ],
      },
    ]);
  });

  it("does not handle a drop the composer editor already consumed", () => {
    const { zone, surface, received } = fixture();
    const data = osFiles(new File(["a"], "a.txt"));
    surface.dispatchEvent(drag("dragenter", data));
    const drop = drag("drop", data);
    // The editor's own drop handler runs first (it is a descendant) and
    // prevents the default when it takes the transfer.
    drop.preventDefault();
    surface.dispatchEvent(drop);
    expect(received).toEqual([]);
    expect(zone.getSnapshot()).toBe(false);
  });

  it("clears on drag end, window blur and any window drop", () => {
    const { zone, surface, window } = fixture();
    const data = osFiles(new File(["a"], "a.txt"));

    surface.dispatchEvent(drag("dragenter", data));
    window.dispatchEvent(new Event("dragend"));
    expect(zone.getSnapshot()).toBe(false);

    surface.dispatchEvent(drag("dragenter", data));
    window.dispatchEvent(new Event("blur"));
    expect(zone.getSnapshot()).toBe(false);

    surface.dispatchEvent(drag("dragenter", data));
    window.dispatchEvent(drag("drop", data));
    expect(zone.getSnapshot()).toBe(false);

    // Depth restarts cleanly after a reset.
    surface.dispatchEvent(drag("dragenter", data));
    surface.dispatchEvent(drag("dragleave", data));
    expect(zone.getSnapshot()).toBe(false);
  });

  it("ignores an empty file drop", () => {
    const { surface, received } = fixture();
    const drop = drag("drop", osFiles());
    surface.dispatchEvent(drop);
    expect(received).toEqual([]);
  });

  it("detaches every listener on disconnect", () => {
    const { zone, surface, received, disconnect } = fixture();
    disconnect();
    const data = osFiles(new File(["a"], "a.txt"));
    surface.dispatchEvent(drag("dragenter", data));
    surface.dispatchEvent(drag("drop", data));
    expect(zone.getSnapshot()).toBe(false);
    expect(received).toEqual([]);
  });
});

describe("ComposerDropArea", () => {
  it("renders its children without a highlight until a file drag arrives", () => {
    const html = renderToStaticMarkup(
      <ComposerDropArea data-testid="chat" onTransfer={() => {}}>
        <p>transcript</p>
      </ComposerDropArea>
    );
    expect(html).toContain('data-testid="chat"');
    expect(html).toContain("<p>transcript</p>");
    expect(html).not.toContain("data-composer-drop-overlay");
  });

  it("draws a purely visual overlay that cannot take the drop", () => {
    const html = renderToStaticMarkup(
      <ComposerDropOverlay label="Drop to attach" />
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("Drop to attach");
  });
});
