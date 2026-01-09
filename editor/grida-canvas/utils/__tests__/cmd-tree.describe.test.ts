import { describeDocumentTree } from "../cmd-tree";
import { editor } from "../../editor.i";
import type grida from "@grida/schema";
import kolor from "@grida/color";

const chars = editor.ascii.chars;

describe("describeDocumentTree", () => {
  const document = {
    nodes: {
      scene: {
        id: "scene",
        type: "scene",
        name: "Root",
        active: true,
        locked: false,
        constraints: { children: "multiple" },
        guides: [],
        edges: [],
      },
      frame: {
        id: "frame",
        type: "container",
        name: "HeroSection",
        active: true,
        locked: false,
        clips_content: false,
        rotation: 0,
        z_index: 0,
        layout_positioning: "absolute",
        layout_mode: "flow",
        direction: "horizontal",
        main_axis_alignment: "start",
        cross_axis_alignment: "start",
        main_axis_gap: 0,
        cross_axis_gap: 0,
        padding_top: 0,
        padding_right: 0,
        padding_bottom: 0,
        padding_left: 0,
        layout_target_width: 1280,
        layout_target_height: 720,
        corner_radius: 0,
        rectangular_corner_radius_top_left: 0,
        rectangular_corner_radius_top_right: 0,
        rectangular_corner_radius_bottom_left: 0,
        rectangular_corner_radius_bottom_right: 0,
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        stroke_miter_limit: 4,
        opacity: 0.9,
        blend_mode: "normal",
        fill_paints: [
          {
            type: "solid",
            color: kolor.colorformats.RGBA32F.fromHEX("#111111"),
            active: true,
          },
        ],
        stroke_paints: [],
      },
      text: {
        id: "text",
        type: "tspan",
        name: "Title",
        active: true,
        locked: false,
        rotation: 0,
        z_index: 0,
        layout_positioning: "absolute",
        layout_target_width: "auto",
        layout_target_height: "auto",
        opacity: 1,
        blend_mode: "normal",
        text: "Welcome to Grida",
        font_family: "Inter",
        font_size: 32,
        font_weight: 700,
        font_kerning: true,
        text_align: "left",
        text_align_vertical: "top",
        text_decoration_line: "none",
        stroke_width: 0,
        stroke_align: "inside",
        fill_paints: [],
      },
      button: {
        id: "button",
        type: "rectangle",
        name: "Button",
        active: true,
        locked: false,
        rotation: 0,
        z_index: 0,
        layout_positioning: "absolute",
        layout_target_width: 160,
        layout_target_height: 48,
        corner_radius: 8,
        rectangular_corner_radius_top_left: 0,
        rectangular_corner_radius_top_right: 0,
        rectangular_corner_radius_bottom_left: 0,
        rectangular_corner_radius_bottom_right: 0,
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        stroke_miter_limit: 4,
        opacity: 1,
        blend_mode: "normal",
        fill_paints: [
          {
            type: "solid",
            color: kolor.colorformats.RGBA32F.fromHEX("#3B82F6"),
            active: true,
          },
        ],
        stroke_paints: [],
      },
    },
    links: {
      scene: ["frame"],
      frame: ["text", "button"],
    },
    scenes_ref: ["scene"],
    entry_scene_id: "scene",
    images: {},
    bitmaps: {},
    properties: {},
  } satisfies grida.program.document.Document;

  const context = {
    lu_keys: Object.keys(document.nodes),
    lu_parent: {
      scene: null,
      frame: "scene",
      text: "frame",
      button: "frame",
    },
    lu_children: {
      scene: ["frame"],
      frame: ["text", "button"],
      text: [],
      button: [],
    },
  };

  it("renders the document root tree", () => {
    const tree = describeDocumentTree(document as any, context as any, {
      chars,
    });

    const expected = [
      "└─ ⛶  Document (nodes=4, scenes=1, entry=scene)",
      "   └─ ⛶  Frame HeroSection  (type=container, id=frame)  [1280×720]  fill=#111111  opacity=0.9",
      '      ├─ ✎  TextSpan Title  (type=tspan, id=text)  "Welcome to Grida"  font=Inter  size=32  weight=700',
      "      └─ ◼  Rect Button  (type=rectangle, id=button)  [160×48]  fill=#3B82F6  radius=8",
    ].join("\n");

    expect(tree).toBe(expected);
  });

  it("renders from an entry node downwards", () => {
    const tree = describeDocumentTree(document as any, context as any, {
      chars,
      entryId: "frame",
    });

    const expected = [
      "└─ ⛶  Frame HeroSection  (type=container, id=frame)  [1280×720]  fill=#111111  opacity=0.9",
      '   ├─ ✎  TextSpan Title  (type=tspan, id=text)  "Welcome to Grida"  font=Inter  size=32  weight=700',
      "   └─ ◼  Rect Button  (type=rectangle, id=button)  [160×48]  fill=#3B82F6  radius=8",
    ].join("\n");

    expect(tree).toBe(expected);
  });

  it("reports missing nodes", () => {
    const tree = describeDocumentTree(document as any, context as any, {
      chars,
      entryId: "missing",
    });

    expect(tree).toBe('└─ Missing node "missing"');
  });
});
