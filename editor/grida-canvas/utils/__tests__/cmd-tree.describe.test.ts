import { describeDocumentTree } from "../cmd-tree";
import { editor } from "../../editor.i";

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
        opacity: 1,
      },
      frame: {
        id: "frame",
        type: "container",
        name: "HeroSection",
        active: true,
        locked: false,
        layout: "flow",
        direction: "horizontal",
        mainAxisAlignment: "start",
        crossAxisAlignment: "start",
        mainAxisGap: 0,
        crossAxisGap: 0,
        padding: 0,
        width: 1280,
        height: 720,
        opacity: 0.9,
        fill: {
          type: "solid",
          color: {
            r: 17 / 255,
            g: 17 / 255,
            b: 17 / 255,
            a: 1,
          },
        },
      },
      text: {
        id: "text",
        type: "text",
        name: "Title",
        active: true,
        locked: false,
        text: "Welcome to Grida",
        fontFamily: "Inter",
        fontSize: 32,
        fontWeight: 700,
        opacity: 1,
      },
      button: {
        id: "button",
        type: "rectangle",
        name: "Button",
        active: true,
        locked: false,
        width: 160,
        height: 48,
        cornerRadius: 8,
        opacity: 1,
        fill: {
          type: "solid",
          color: {
            r: 59 / 255,
            g: 130 / 255,
            b: 246 / 255,
            a: 1,
          },
        },
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
  } as const;

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
      '      ├─ ✎  Text Title  (type=text, id=text)  "Welcome to Grida"  font=Inter  size=32  weight=700',
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
      '   ├─ ✎  Text Title  (type=text, id=text)  "Welcome to Grida"  font=Inter  size=32  weight=700',
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
