import { expect, it } from "vitest";
import { NativeEditorSvgSelection } from "./native-editor-svg-selection";

const revision = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

it("only accepts revision-scoped cursors and finite opacities", () => {
  const cursor = { revision, offset: 32 };
  expect(
    NativeEditorSvgSelection.operation({ kind: "inspect", cursor })
  ).toEqual({
    kind: "inspect",
    cursor,
  });
  expect(
    NativeEditorSvgSelection.operation({
      kind: "inspect",
      cursor: { ...cursor, offset: -1 },
    })
  ).toBeUndefined();
  for (const opacity of [0, 0.5, 1]) {
    const operation = { kind: "set-opacity", revision, opacity };
    expect(NativeEditorSvgSelection.operation(operation)).toEqual(operation);
    expect(
      NativeEditorSvgSelection.operation({ ...operation, path: "/other.svg" })
    ).toBeUndefined();
  }
  for (const opacity of [NaN, Infinity, -0.1, 1.1, "0.5"]) {
    expect(
      NativeEditorSvgSelection.operation({
        kind: "set-opacity",
        revision,
        opacity,
      })
    ).toBeUndefined();
  }
});

it.each(["雪", "\u0001"])(
  "bounds encoded page bytes even when every item is valid",
  (character) => {
    const label = character.repeat(NativeEditorSvgSelection.MAX_LABEL_LENGTH);
    const targets = Array.from(
      { length: NativeEditorSvgSelection.MAX_PAGE_ITEMS },
      (_, index) => ({
        kind: "element" as const,
        elementPath: [index],
        tag: label,
        id: label,
      })
    );
    const page: NativeEditorSvgSelection.Inspection = {
      kind: "inspection",
      revision,
      path: "/design.svg",
      mode: "objects",
      total: targets.length,
      targets,
      nextCursor: null,
    };
    expect(NativeEditorSvgSelection.pageBytes(page)).toBeGreaterThan(
      NativeEditorSvgSelection.MAX_PAGE_BYTES
    );
    expect(NativeEditorSvgSelection.result(page)).toBeUndefined();

    const small = {
      ...page,
      targets: targets.slice(0, 1),
      nextCursor: { revision, offset: 1 },
    };
    expect(NativeEditorSvgSelection.result(small)).toEqual(small);
    expect(
      NativeEditorSvgSelection.result({
        ...small,
        nextCursor: { revision, offset: page.total },
      })
    ).toBeUndefined();
  }
);

it("refuses malformed Unicode labels before forwarding the page to Rust", () => {
  const page = {
    kind: "inspection",
    revision,
    path: "/design.svg",
    mode: "objects",
    total: 1,
    nextCursor: null,
  };
  const target = { kind: "element", elementPath: [0], tag: "rect" };
  expect(
    NativeEditorSvgSelection.result({
      ...page,
      targets: [{ ...target, id: "shape-🌱" }],
    })
  ).toEqual({ ...page, targets: [{ ...target, id: "shape-🌱" }] });
  expect(
    NativeEditorSvgSelection.result({
      ...page,
      targets: [{ ...target, id: "shape-\uD800" }],
    })
  ).toBeUndefined();
});

it("requires a locator omission to name its exact position in the selection", () => {
  const page = {
    kind: "inspection",
    revision,
    path: "/design.svg",
    mode: "objects",
    total: 4,
    nextCursor: { revision, offset: 3 },
  };
  const omitted = { kind: "omitted", index: 2, reason: "locator_too_large" };
  expect(
    NativeEditorSvgSelection.result({ ...page, targets: [omitted] })
  ).toEqual({ ...page, targets: [omitted] });
  expect(
    NativeEditorSvgSelection.result({
      ...page,
      targets: [{ ...omitted, index: 1 }],
    })
  ).toBeUndefined();
  expect(
    NativeEditorSvgSelection.result({
      ...page,
      nextCursor: null,
      targets: [omitted],
    })
  ).toBeUndefined();
});
