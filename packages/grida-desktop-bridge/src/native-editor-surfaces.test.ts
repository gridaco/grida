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
