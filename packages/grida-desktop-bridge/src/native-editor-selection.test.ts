import { expect, it } from "vitest";
import { NativeEditorSelection } from "./native-editor-selection";

const revision = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

it("accepts a capture with an exact token and its typed subject", () => {
  const subject = {
    kind: "document",
    path: "/deck.canvas/title.svg",
    placement: { boardPath: "/deck.canvas", pinId: "first" },
  };
  const capture = { targetId: revision, subject };
  expect(NativeEditorSelection.capture(capture)).toEqual(capture);
  for (const value of [
    revision,
    { targetId: revision },
    { ...capture, targetId: "not a capture token" },
    { ...capture, path: subject.path },
    { ...capture, subject: { ...subject, path: "/other/title.svg" } },
  ]) {
    expect(NativeEditorSelection.capture(value)).toBeUndefined();
  }
});

it("compares the document and placement identity of a selection", () => {
  const path = "/deck.canvas/title.svg";
  const placement = { boardPath: "/deck.canvas", pinId: "cover 🔹" };
  const value = { kind: "document", path, placement };
  const subject = NativeEditorSelection.subject(value);
  expect(subject).toEqual(value);
  expect(
    NativeEditorSelection.sameSubject(
      subject,
      NativeEditorSelection.subject(value)
    )
  ).toBe(true);
  for (const other of [
    { kind: "svg", path },
    { kind: "document", path },
    { ...value, placement: { boardPath: "/", pinId: placement.pinId } },
    { ...value, placement: { ...placement, pinId: "different pin" } },
  ]) {
    const candidate = NativeEditorSelection.subject(other);
    expect(candidate).toEqual(other);
    expect(NativeEditorSelection.sameSubject(subject, candidate)).toBe(false);
  }
  for (const pinId of ["", "bad\nname", "\uD800", "🔹".repeat(65)]) {
    expect(
      NativeEditorSelection.subject({
        ...value,
        placement: { ...placement, pinId },
      })
    ).toBeUndefined();
  }
  expect(
    NativeEditorSelection.subject({
      ...value,
      path: "/deck.canvas-old/title.svg",
    })
  ).toBeUndefined();
});

it("validates one whole document with or without a finite board layout", () => {
  const page = {
    kind: "inspection",
    mode: "document",
    path: "/deck.canvas/title.svg",
    revision,
    total: 1,
    nextCursor: null,
  };
  const placement = { boardPath: "/deck.canvas", pinId: "cover" };
  const target = { kind: "document" };
  const result = (targets: unknown[]) =>
    NativeEditorSelection.result({ ...page, targets });
  expect(result([target])).toEqual({ ...page, targets: [target] });
  for (const layout of [null, { x: -5, y: 0.5, w: 1920, h: 1080, z: 2 }]) {
    const placed = { ...target, placement: { ...placement, layout } };
    expect(result([placed])).toEqual({ ...page, targets: [placed] });
  }
  for (const layout of [
    undefined,
    { x: NaN },
    { z: Infinity },
    { h: "10" },
    { rotation: 0 },
  ]) {
    expect(
      result([{ ...target, placement: { ...placement, layout } }])
    ).toBeUndefined();
  }
  expect(result([target, target])).toBeUndefined();
  expect(
    NativeEditorSelection.result({
      ...page,
      targets: [target],
      total: 2,
      nextCursor: { revision, offset: 1 },
    })
  ).toBeUndefined();
});

it("only accepts revision-scoped cursors and finite opacities", () => {
  const cursor = { revision, offset: 32 };
  expect(NativeEditorSelection.operation({ kind: "inspect", cursor })).toEqual({
    kind: "inspect",
    cursor,
  });
  expect(
    NativeEditorSelection.operation({
      kind: "inspect",
      cursor: { ...cursor, offset: -1 },
    })
  ).toBeUndefined();
  for (const opacity of [0, 0.5, 1]) {
    const operation = { kind: "set-opacity", revision, opacity };
    expect(NativeEditorSelection.operation(operation)).toEqual(operation);
    expect(
      NativeEditorSelection.operation({ ...operation, path: "/other.svg" })
    ).toBeUndefined();
  }
  for (const opacity of [NaN, Infinity, -0.1, 1.1, "0.5"]) {
    expect(
      NativeEditorSelection.operation({
        kind: "set-opacity",
        revision,
        opacity,
      })
    ).toBeUndefined();
  }
});

it("accepts bounded text on the captured SVG revision", () => {
  expect(NativeEditorSelection.operation({ kind: "read-text" })).toEqual({
    kind: "read-text",
  });
  expect(
    NativeEditorSelection.operation({ kind: "read-text", revision })
  ).toBeUndefined();
  const text = "An editable heading 雪";
  const replace = { kind: "replace-text", revision, text };
  expect(NativeEditorSelection.operation(replace)).toEqual(replace);
  expect(
    NativeEditorSelection.operation({ ...replace, revision: "invalid" })
  ).toBeUndefined();
  const result = {
    kind: "text",
    revision,
    text,
    path: "/deck.canvas/slide.svg",
  };
  expect(NativeEditorSelection.result(result)).toEqual(result);
  expect(
    NativeEditorSelection.result({ ...result, path: "/deck.canvas" })
  ).toBeUndefined();
  expect(
    NativeEditorSelection.result({ ...result, saved: false })
  ).toBeUndefined();

  for (const text of ["a\0b", "\uD800", "😀".repeat(1025)]) {
    expect(
      NativeEditorSelection.operation({ ...replace, text })
    ).toBeUndefined();
    expect(NativeEditorSelection.result({ ...result, text })).toBeUndefined();
  }
});

it.each(["雪", "\u0001"])(
  "bounds encoded page bytes even when every item is valid",
  (character) => {
    const label = character.repeat(NativeEditorSelection.MAX_LABEL_LENGTH);
    const targets = Array.from(
      { length: NativeEditorSelection.MAX_PAGE_ITEMS },
      (_, index) => ({
        kind: "element" as const,
        elementPath: [index],
        tag: label,
        id: label,
      })
    );
    const page: NativeEditorSelection.Inspection = {
      kind: "inspection",
      revision,
      path: "/design.svg",
      mode: "objects",
      total: targets.length,
      targets,
      nextCursor: null,
    };
    expect(NativeEditorSelection.pageBytes(page)).toBeGreaterThan(
      NativeEditorSelection.MAX_PAGE_BYTES
    );
    expect(NativeEditorSelection.result(page)).toBeUndefined();

    const small = {
      ...page,
      targets: targets.slice(0, 1),
      nextCursor: { revision, offset: 1 },
    };
    expect(NativeEditorSelection.result(small)).toEqual(small);
    expect(
      NativeEditorSelection.result({
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
    NativeEditorSelection.result({
      ...page,
      targets: [{ ...target, id: "shape-🌱" }],
    })
  ).toEqual({ ...page, targets: [{ ...target, id: "shape-🌱" }] });
  expect(
    NativeEditorSelection.result({
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
  expect(NativeEditorSelection.result({ ...page, targets: [omitted] })).toEqual(
    { ...page, targets: [omitted] }
  );
  expect(
    NativeEditorSelection.result({
      ...page,
      targets: [{ ...omitted, index: 1 }],
    })
  ).toBeUndefined();
  expect(
    NativeEditorSelection.result({
      ...page,
      nextCursor: null,
      targets: [omitted],
    })
  ).toBeUndefined();
});
