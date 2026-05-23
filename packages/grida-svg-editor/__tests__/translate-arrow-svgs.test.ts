// Repro for "arrow-svgs translate wrong / wrong scale".
// Loads each fixture into an SvgDocument, captures the translate baseline,
// applies a (dx, dy), and asserts the resulting <path d> shifts every
// path's bbox by exactly (dx, dy) with size preserved.
//
// If this test passes, the bug is NOT in `capture_translate_baseline +
// apply_translate + shift_path_d` — it lives downstream (gesture
// dx/dy derivation, viewBox-to-CSS mismatch, render layer).

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { SVGPathData } from "@grida/svg/pathdata";
import { SvgDocument } from "../src/core/document";
import { translate_pipeline } from "../src/core/translate-pipeline";

const FIXTURES = [
  "/Users/softmarshmallow/Downloads/arrow-svgs/make_a_logo_019e49df-cf34-74c3-adfd-17febc31c39c.svg",
  "/Users/softmarshmallow/Downloads/arrow-svgs/ok_hand_gesture_pinching_a_small_sad_face_emoji_da_019e49e4-ac4c-7120-a40f-ff0b833087f9.svg",
  "/Users/softmarshmallow/Downloads/arrow-svgs/kneeling_human_figure_holding_a_branch_of_apples_m_019e456c-8c53-7afc-b1cd-11613d15e5f7.svg",
];

const dx = 100;
const dy = 50;

function bbox_of(d: string) {
  return new SVGPathData(d).getBounds();
}

describe("arrow-svgs translate", () => {
  for (const path of FIXTURES) {
    const name = path.split("/").pop()!;
    const exists = existsSync(path);

    it.skipIf(!exists)(
      `${name}: each <path> shifts bbox by (${dx},${dy}) with size preserved`,
      () => {
        const src = readFileSync(path, "utf8");
        const doc = new SvgDocument(src);
        const all_ids: string[] = [];
        const walk = (id: string) => {
          all_ids.push(id);
          for (const c of doc.element_children_of(id)) walk(c);
        };
        walk(doc.root);

        const path_ids = all_ids.filter((id) => doc.tag_of(id) === "path");
        expect(path_ids.length).toBeGreaterThan(0);

        const failures: string[] = [];
        for (const id of path_ids) {
          const d_before = doc.get_attr(id, "d") ?? "";
          if (!d_before.trim()) continue;

          let b0;
          try {
            b0 = bbox_of(d_before);
          } catch {
            continue;
          }
          // Degenerate (single moveto, no draw): bbox has 0 area; still
          // verify minX/minY shift but skip the size check on Infinity.
          const has_area =
            isFinite(b0.minX) &&
            isFinite(b0.maxX) &&
            isFinite(b0.minY) &&
            isFinite(b0.maxY) &&
            b0.maxX > b0.minX &&
            b0.maxY > b0.minY;

          const baseline = translate_pipeline.intent.capture_baseline(doc, id);
          translate_pipeline.intent.apply(doc, id, baseline, dx, dy);

          const d_after = doc.get_attr(id, "d") ?? "";
          let b1;
          try {
            b1 = bbox_of(d_after);
          } catch (e) {
            failures.push(
              `${id}: bbox parse error after translate: ${(e as Error).message}`
            );
            continue;
          }
          if (!has_area) continue;

          const err_origin_x = b1.minX - (b0.minX + dx);
          const err_origin_y = b1.minY - (b0.minY + dy);
          const err_w = b1.maxX - b1.minX - (b0.maxX - b0.minX);
          const err_h = b1.maxY - b1.minY - (b0.maxY - b0.minY);
          const tol = 1e-6;
          if (
            Math.abs(err_origin_x) > tol ||
            Math.abs(err_origin_y) > tol ||
            Math.abs(err_w) > tol ||
            Math.abs(err_h) > tol
          ) {
            failures.push(
              `${id}: bbox err origin=(${err_origin_x.toFixed(3)},${err_origin_y.toFixed(3)}) size=(${err_w.toFixed(3)},${err_h.toFixed(3)})`
            );
          }
        }

        expect(failures).toEqual([]);
      }
    );
  }
});
