// Hot-loop microbenchmarks for @grida/svg-editor.
//
// Covers the operations exercised on every render / drag frame:
//
//   1. editor.serialize()                          — raw doc → string.
//   2. doc.all_elements()                          — enumerate node ids.
//   3. legacy render() sweep (kept as historical baseline) — what dom.ts
//      USED to do per render: 2N set_attr writes around serialize() to
//      inject [data-grida-svg-element-id], then strip them back off.
//      Replaced by an IR-clean render path; this bench documents the cost
//      that path used to pay so a regression is visible.
//   4. render() IR cost (current path) — just `editor.serialize()`. The new
//      render() does not mutate the IR; tagging happens in DOM-space during
//      the post-parse walk (browser-only, can't bench in Node).
//   5. one full per-frame translate cycle:
//      capture_translate_baseline + apply_translate + emit + serialize.
//      Mirrors the cost the DOM surface pays for every pointer-move
//      during a drag.
//
// Fixture is the Observatory No. 7 poster from the /svg
// playground — a realistic, hand-authored-style SVG with nested groups,
// gradients, defs, symbols, masks, mixed paint, and a few hundred
// elements (large enough that the hot loop actually does work).

import { bench, describe } from "vitest";
import { createSvgEditor } from "../src/index";
import OBSERVATORY from "../../../editor/app/(canvas)/svg/_fixtures/default";

const ID_ATTR = "data-grida-svg-element-id";

describe("hotloop", () => {
  bench("editor.serialize()", () => {
    const editor = createSvgEditor({ svg: OBSERVATORY });
    editor.serialize();
  });

  bench("doc.all_elements()", () => {
    const editor = createSvgEditor({ svg: OBSERVATORY });
    const doc = editor._internal.doc;
    doc.all_elements();
  });

  bench("legacy render() sweep: tag + serialize + untag (2N set_attr)", () => {
    const editor = createSvgEditor({ svg: OBSERVATORY });
    const doc = editor._internal.doc;
    const ids = doc.all_elements();
    for (const id of ids) doc.set_attr(id, ID_ATTR, id);
    editor.serialize();
    for (const id of ids) doc.set_attr(id, ID_ATTR, null);
  });

  bench("render() IR cost (current): serialize + all_elements", () => {
    const editor = createSvgEditor({ svg: OBSERVATORY });
    const doc = editor._internal.doc;
    editor.serialize();
    doc.all_elements();
  });

  bench("per-frame translate: capture_baseline + apply_translate + emit + serialize", () => {
    const editor = createSvgEditor({ svg: OBSERVATORY });
    const doc = editor._internal.doc;
    const { capture_translate_baseline, apply_translate, emit } =
      editor._internal;

    // Pick a real, translatable target (skip <svg> root + defs subtree).
    const ids = doc.all_elements();
    let target: string | null = null;
    for (const id of ids) {
      const tag = doc.tag_of(id);
      if (
        tag === "rect" ||
        tag === "circle" ||
        tag === "ellipse" ||
        tag === "path" ||
        tag === "g"
      ) {
        target = id;
        break;
      }
    }
    if (!target) throw new Error("no translatable target in fixture");

    const baseline = capture_translate_baseline(doc, target);
    apply_translate(doc, target, baseline, 1, 1);
    emit();
    editor.serialize();
  });
});
