import { describe, expect, test } from "vitest";
import type { DocumentAction } from "@/grida-canvas/action";
import { editor } from "@/grida-canvas";
import documentReducer from "../document.reducer";
import { createReducerContext } from "@/grida-canvas/__tests__/utils/stubs";
import {
  containerNode,
  rectNode,
  sceneNode,
} from "@/grida-canvas/__tests__/utils/factories";
import grida from "@grida/schema";

const VIEWPORT = { width: 1000, height: 1000 };
const OFFSCREEN_RECT = { x: 2000, y: 3000, width: 100, height: 100 };
const VIEWPORT_CENTERED_POSITION = { x: 450, y: 450 };

function createDocument(args?: {
  children?: string[];
  nodes?: Record<string, grida.program.nodes.Node>;
}): grida.program.document.Document {
  return {
    scenes_ref: ["scene"],
    links: {
      scene: args?.children ?? [],
    },
    nodes: {
      scene: sceneNode("scene", "Scene"),
      ...args?.nodes,
    },
    entry_scene_id: "scene",
    bitmaps: {},
    images: {},
    properties: {},
  };
}

function createOffscreenRectPrototype(): grida.program.nodes.NodePrototype {
  const document = createDocument({
    children: ["copied"],
    nodes: {
      copied: rectNode("copied", OFFSCREEN_RECT),
    },
  });

  return grida.program.nodes.factory.createPrototypeFromSnapshot(
    document,
    "copied"
  );
}

function createState(args: {
  document: grida.program.document.Document;
}): editor.state.IEditorState {
  return {
    ...editor.state.init({
      editable: true,
      debug: false,
      document: args.document,
      templates: {},
    }),
    user_clipboard: {
      payload_id: "paste-position",
      type: "prototypes",
      ids: ["copied"],
      prototypes: [createOffscreenRectPrototype()],
    },
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
  };
}

function paste(
  state: editor.state.IEditorState,
  target: string
): editor.state.IEditorState {
  let id = 0;
  return documentReducer(
    state,
    { type: "paste", target } as DocumentAction,
    createReducerContext({
      viewport: VIEWPORT,
      idgen: {
        next: () => `pasted-${++id}`,
      },
      geometry: {
        getNodeIdsFromPoint: () => [],
        getNodeIdsFromPointerEvent: () => [],
        getNodeIdsFromEnvelope: () => [],
        getNodeAbsoluteBoundingRect: (node_id) => {
          if (node_id === "container") {
            return { x: 100, y: 200, width: 400, height: 400 };
          }
          return null;
        },
        getNodeAbsoluteRotation: () => 0,
      },
    })
  );
}

describe("document reducer - paste positioning", () => {
  test("moves scene-level pasted content into the current viewport", () => {
    const state = createState({
      document: createDocument(),
    });

    const next = paste(state, "scene");

    expect(next.document.links.scene).toEqual(["pasted-1"]);
    const pasted = next.document.nodes[
      "pasted-1"
    ] as grida.program.nodes.RectangleNode;
    expect(pasted.layout_inset_left).toBe(VIEWPORT_CENTERED_POSITION.x);
    expect(pasted.layout_inset_top).toBe(VIEWPORT_CENTERED_POSITION.y);
  });

  test("keeps container-target pasted content viewport-aware in absolute space", () => {
    const state = createState({
      document: createDocument({
        children: ["container"],
        nodes: {
          container: {
            ...containerNode("container", "Container"),
            layout_inset_left: 100,
            layout_inset_top: 200,
          },
        },
      }),
    });

    const next = paste(state, "container");

    expect(next.document.links.container).toEqual(["pasted-1"]);
    const pasted = next.document.nodes[
      "pasted-1"
    ] as grida.program.nodes.RectangleNode;
    expect(pasted.layout_inset_left).toBe(VIEWPORT_CENTERED_POSITION.x - 100);
    expect(pasted.layout_inset_top).toBe(VIEWPORT_CENTERED_POSITION.y - 200);
  });
});
