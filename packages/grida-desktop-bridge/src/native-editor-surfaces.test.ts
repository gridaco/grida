import { expect, it } from "vitest";
import { NativeEditorSurfaces } from "./native-editor-surfaces";

it("keeps the active tab and original order when the tab count is bounded", () => {
  const open = Array.from({ length: 55 }, (_, index) => `/tab-${index}.svg`);
  const active = open[52];
  const snapshot = NativeEditorSurfaces.capture({ active, open });
  expect(snapshot).toEqual({
    active,
    open: [...open.slice(0, 49), active],
    truncated: true,
  });
  expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
});

it("counts UTF-8 and JSON escaping while retaining the active tab", () => {
  const paths = Array.from(
    { length: 10 },
    (_, index) => `/tab-${index}-${"😊".repeat(990)}"`
  );
  const active = paths.at(-1)!;
  const snapshot = NativeEditorSurfaces.capture({ active, open: paths });
  expect(snapshot.active).toBe(active);
  expect(snapshot.open.at(-1)).toBe(active);
  expect(snapshot.open.length).toBeLessThan(paths.length);
  expect(snapshot.truncated).toBe(true);
  expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
  expect(
    NativeEditorSurfaces.parse({ active, open: paths, truncated: false })
  ).toBeNull();
});

it("preserves the tab inventory and the editable SVG identity", () => {
  const active = "/deck.CANVAS";
  const open = ["/other.svg", active];
  const activeSvg = "/deck.CANVAS/slides/first.SVG";
  const snapshot = { active, open, activeSvg, truncated: false };
  expect(NativeEditorSurfaces.capture({ active, open, activeSvg })).toEqual(
    snapshot
  );
  expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
  expect(
    NativeEditorSurfaces.parse({
      ...snapshot,
      active: "/other.svg",
      activeSvg: "/other.svg",
    })
  ).toEqual({ ...snapshot, active: "/other.svg", activeSvg: "/other.svg" });
});

it("rejects invalid SVG identities and SVGs outside the active tab", () => {
  const active = "/deck.canvas";
  const snapshot = { active, open: [active, "/other.svg"], truncated: false };
  expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
  for (const activeSvg of [
    undefined,
    null,
    "/other.svg",
    "/deck.canvas-other/slide.svg",
    "/deck.canvas/../other.svg",
    "/deck.canvas/slides/list.json",
  ]) {
    expect(NativeEditorSurfaces.parse({ ...snapshot, activeSvg })).toBeNull();
  }
  expect(
    NativeEditorSurfaces.parse({
      ...snapshot,
      active: null,
      activeSvg: "/deck.canvas/slide.svg",
    })
  ).toBeNull();
});

it("accounts for an escaped SVG identity within the snapshot budget", () => {
  const active = `/${"\t".repeat(2400)}.canvas`;
  const activeSvg = `${active}/${'"'.repeat(1500)}.svg`;
  const source = { active, open: [active], activeSvg };
  const snapshot = NativeEditorSurfaces.capture(source);
  expect(snapshot).toEqual({ active, open: [active], truncated: true });
  expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
  expect(
    NativeEditorSurfaces.parse({ ...source, truncated: false })
  ).toBeNull();
});

it("accepts typed subjects within the active workspace tab", () => {
  const active = "/projects/launch.canvas";
  const path = `${active}/slides/title.svg`;
  const open = [active, "/standalone.svg"];
  const svg = { kind: "svg", path } as const;
  const placed = {
    kind: "document",
    path,
    placement: { boardPath: active, pinId: "cover pin" },
  } as const;
  for (const selection of [svg, placed]) {
    const source = { active, open, selection };
    const snapshot = { ...source, truncated: false };
    expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
    expect(NativeEditorSurfaces.capture(source)).toEqual(snapshot);
    expect(
      NativeEditorSurfaces.parse({ ...snapshot, activeSvg: path })
    ).toBeNull();
  }
  const source = {
    active: "/standalone.svg",
    open,
    selection: { kind: "document", path: "/standalone.svg" },
  } as const;
  expect(NativeEditorSurfaces.capture(source)).toEqual({
    ...source,
    truncated: false,
  });
  for (const selection of [
    { kind: "document", path },
    { ...placed, path: "/standalone.svg" },
    { ...placed, placement: { ...placed.placement, boardPath: "/" } },
    {
      ...placed,
      path: "/other.canvas/title.svg",
      placement: { ...placed.placement, boardPath: "/other.canvas" },
    },
  ]) {
    expect(
      NativeEditorSurfaces.parse({ active, open, selection, truncated: false })
    ).toBeNull();
  }
});

it("accepts a bundle-root board subject only with an empty inventory", () => {
  const source = {
    active: null,
    open: [],
    selection: {
      kind: "document",
      path: "/slides/title.svg",
      placement: { boardPath: "/", pinId: "first" },
    },
  } as const;
  const snapshot = { ...source, truncated: false };
  expect(NativeEditorSurfaces.parse(snapshot)).toEqual(snapshot);
  expect(NativeEditorSurfaces.capture(source)).toEqual(snapshot);
  expect(
    NativeEditorSurfaces.parse({ ...snapshot, open: ["/other.canvas"] })
  ).toBeNull();
  expect(
    NativeEditorSurfaces.parse({ ...snapshot, truncated: true })
  ).toBeNull();
  expect(
    NativeEditorSurfaces.parse({
      ...snapshot,
      selection: { ...source.selection, path: "/slides/../../outside.svg" },
    })
  ).toBeNull();
});

it("refuses unknown fields, invalid paths, duplicates, and an unrelated active tab", () => {
  const empty = { active: null, open: [], truncated: false };
  expect(NativeEditorSurfaces.parse(empty)).toEqual(empty);
  for (const open of [
    ["/"],
    ["//tab"],
    ["/a/../b"],
    ["/a/./b"],
    ["/a\\b"],
    ["/a\0b"],
    ["/" + "😊".repeat(1024)],
    ["/a", "/a"],
    Array(1),
  ]) {
    expect(NativeEditorSurfaces.parse({ ...empty, open })).toBeNull();
  }
  expect(
    NativeEditorSurfaces.parse({ ...empty, active: "/missing" })
  ).toBeNull();
  expect(
    NativeEditorSurfaces.parse({ ...empty, workspace: "other" })
  ).toBeNull();
});
