/**
 * Tests for selection decision logic.
 *
 * These tests verify that the module correctly implements all UX logic from:
 * @see docs/wg/feat-editor/ux-surface/selection.md
 */

import {
  decidePointerDownSelection,
  decideClickSelection,
  decideDragStartAction,
  type PointerDownContext,
  type ClickContext,
  type DragStartContext,
} from "../selection";
import grida from "@grida/schema";

// Mock document context for testing
function createMockDocumentContext(
  hierarchy: Record<string, string | null>
): grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext {
  return {
    lu_parent: hierarchy,
    lu_keys: Object.keys(hierarchy),
  } as grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;
}

describe("selection", () => {
  describe("decidePointerDownSelection", () => {
    describe("Immediate operations (on pointerdown)", () => {
      test("unselected node without shift → immediate reset", () => {
        const context: PointerDownContext = {
          hovered_node_id: "nodeA",
          shiftKey: false,
          current_selection: ["nodeB"],
          document_ctx: createMockDocumentContext({ nodeA: null, nodeB: null }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "immediate",
          mode: "reset",
          node_id: "nodeA",
        });
      });

      test("unselected node with shift → immediate add", () => {
        const context: PointerDownContext = {
          hovered_node_id: "nodeA",
          shiftKey: true,
          current_selection: ["nodeB"],
          document_ctx: createMockDocumentContext({ nodeA: null, nodeB: null }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "immediate",
          mode: "add",
          node_id: "nodeA",
        });
      });

      test("empty space outside overlay without shift → immediate clear", () => {
        const context: PointerDownContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({ nodeA: null }),
          is_empty_space_within_overlay: false,
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "immediate",
          mode: "clear",
        });
      });

      test("empty space outside overlay without shift (undefined overlay) → immediate clear", () => {
        const context: PointerDownContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({ nodeA: null }),
          is_empty_space_within_overlay: undefined,
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "immediate",
          mode: "clear",
        });
      });
    });

    describe("Deferred operations (on click)", () => {
      test("selected node without shift → deferred reset", () => {
        const context: PointerDownContext = {
          hovered_node_id: "nodeA",
          shiftKey: false,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({ nodeA: null }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "deferred",
          operation: "reset",
          node_id: "nodeA",
        });
      });

      test("selected node with shift → deferred toggle", () => {
        const context: PointerDownContext = {
          hovered_node_id: "nodeA",
          shiftKey: true,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({ nodeA: null }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "deferred",
          operation: "toggle",
          node_id: "nodeA",
        });
      });

      test("child of selected node → deferred reset", () => {
        // nodeB is a child of nodeA
        const context: PointerDownContext = {
          hovered_node_id: "nodeB",
          shiftKey: false,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({
            nodeA: null,
            nodeB: "nodeA",
          }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "deferred",
          operation: "reset",
          node_id: "nodeB",
        });
      });

      test("empty space within overlay without shift → deferred clear", () => {
        const context: PointerDownContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: ["nodeA", "nodeB"],
          document_ctx: createMockDocumentContext({ nodeA: null, nodeB: null }),
          is_empty_space_within_overlay: true,
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "deferred",
          operation: "reset",
          node_id: "__clear_selection__",
        });
      });
    });

    describe("Edge cases", () => {
      test("empty space with shift → none", () => {
        const context: PointerDownContext = {
          hovered_node_id: null,
          shiftKey: true,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({ nodeA: null }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({ type: "none" });
      });

      test("child of selected node with shift → deferred reset (not toggle)", () => {
        // Child nodes always defer reset, regardless of shift key
        const context: PointerDownContext = {
          hovered_node_id: "nodeB",
          shiftKey: true,
          current_selection: ["nodeA"],
          document_ctx: createMockDocumentContext({
            nodeA: null,
            nodeB: "nodeA",
          }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "deferred",
          operation: "reset",
          node_id: "nodeB",
        });
      });

      test("multi-selection: selected node → deferred", () => {
        const context: PointerDownContext = {
          hovered_node_id: "nodeA",
          shiftKey: false,
          current_selection: ["nodeA", "nodeB"],
          document_ctx: createMockDocumentContext({
            nodeA: null,
            nodeB: null,
          }),
        };
        const result = decidePointerDownSelection(context);
        expect(result).toEqual({
          type: "deferred",
          operation: "reset",
          node_id: "nodeA",
        });
      });
    });
  });

  describe("decideClickSelection", () => {
    test("clicked node matches deferred → apply toggle", () => {
      const context: ClickContext = {
        clicked_node_id: "nodeA",
        deferred_selection: {
          node_id: "nodeA",
          operation: "toggle",
        },
      };
      const result = decideClickSelection(context);
      expect(result).toEqual({
        type: "immediate",
        mode: "toggle",
        node_id: "nodeA",
      });
    });

    test("clicked node matches deferred → apply reset", () => {
      const context: ClickContext = {
        clicked_node_id: "nodeA",
        deferred_selection: {
          node_id: "nodeA",
          operation: "reset",
        },
      };
      const result = decideClickSelection(context);
      expect(result).toEqual({
        type: "immediate",
        mode: "reset",
        node_id: "nodeA",
      });
    });

    test("clicked node doesn't match → none", () => {
      const context: ClickContext = {
        clicked_node_id: "nodeB",
        deferred_selection: {
          node_id: "nodeA",
          operation: "toggle",
        },
      };
      const result = decideClickSelection(context);
      expect(result).toEqual({ type: "none" });
    });

    test("no deferred selection → none", () => {
      const context: ClickContext = {
        clicked_node_id: "nodeA",
        deferred_selection: undefined,
      };
      const result = decideClickSelection(context);
      expect(result).toEqual({ type: "none" });
    });

    test("deferred clear selection → apply clear", () => {
      const context: ClickContext = {
        clicked_node_id: null,
        deferred_selection: {
          node_id: "__clear_selection__",
          operation: "reset",
        },
      };
      const result = decideClickSelection(context);
      expect(result).toEqual({
        type: "immediate",
        mode: "clear",
      });
    });
  });

  describe("Documentation test cases", () => {
    // Test case: Empty Space Click
    test("Empty Space Click - clears immediately", () => {
      const context: PointerDownContext = {
        hovered_node_id: null,
        shiftKey: false,
        current_selection: ["nodeA"],
        document_ctx: createMockDocumentContext({ nodeA: null }),
        is_empty_space_within_overlay: false,
      };
      const result = decidePointerDownSelection(context);
      expect(result.type).toBe("immediate");
      expect(result).toEqual({
        type: "immediate",
        mode: "clear",
      });
    });

    // Test case: Single Selection - Child Click
    test("Single Selection - Child Click - defers reset", () => {
      const context: PointerDownContext = {
        hovered_node_id: "childRect",
        shiftKey: false,
        current_selection: ["container"],
        document_ctx: createMockDocumentContext({
          container: null,
          childRect: "container",
        }),
      };
      const result = decidePointerDownSelection(context);
      expect(result).toEqual({
        type: "deferred",
        operation: "reset",
        node_id: "childRect",
      });
    });

    // Test case: Multi-Selection - Node Click Within Selection
    test("Multi-Selection - Node Click Within Selection - defers reset", () => {
      const context: PointerDownContext = {
        hovered_node_id: "nodeA",
        shiftKey: false,
        current_selection: ["nodeA", "nodeB"],
        document_ctx: createMockDocumentContext({
          nodeA: null,
          nodeB: null,
        }),
      };
      const result = decidePointerDownSelection(context);
      expect(result).toEqual({
        type: "deferred",
        operation: "reset",
        node_id: "nodeA",
      });
    });

    // Test case: Single Selection - Node Toggle (Shift+Click)
    test("Single Selection - Node Toggle (Shift+Click) - defers toggle", () => {
      const context: PointerDownContext = {
        hovered_node_id: "nodeA",
        shiftKey: true,
        current_selection: ["nodeA"],
        document_ctx: createMockDocumentContext({ nodeA: null }),
      };
      const result = decidePointerDownSelection(context);
      expect(result).toEqual({
        type: "deferred",
        operation: "toggle",
        node_id: "nodeA",
      });
    });

    // Test case: Multi-Selection - Node Toggle Within Selection
    test("Multi-Selection - Node Toggle Within Selection - defers toggle", () => {
      const context: PointerDownContext = {
        hovered_node_id: "nodeA",
        shiftKey: true,
        current_selection: ["nodeA", "nodeB"],
        document_ctx: createMockDocumentContext({
          nodeA: null,
          nodeB: null,
        }),
      };
      const result = decidePointerDownSelection(context);
      expect(result).toEqual({
        type: "deferred",
        operation: "toggle",
        node_id: "nodeA",
      });
    });

    // Test case: Multi-Selection - Empty Space Click Within Overlay
    test("Multi-Selection - Empty Space Click Within Overlay - defers clear", () => {
      const context: PointerDownContext = {
        hovered_node_id: null,
        shiftKey: false,
        current_selection: ["nodeA", "nodeB"],
        document_ctx: createMockDocumentContext({
          nodeA: null,
          nodeB: null,
        }),
        is_empty_space_within_overlay: true,
      };
      const result = decidePointerDownSelection(context);
      expect(result).toEqual({
        type: "deferred",
        operation: "reset",
        node_id: "__clear_selection__",
      });
    });
  });

  describe("decideDragStartAction", () => {
    describe("Drag actions", () => {
      test("hovered node → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: "nodeA",
          shiftKey: false,
          current_selection: [],
          is_empty_space_within_overlay: undefined,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });

      test("selected node hovered → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: "nodeA",
          shiftKey: true,
          current_selection: ["nodeA"],
          is_empty_space_within_overlay: undefined,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });

      test("has selection + empty space within overlay (no Shift) → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: ["nodeA", "nodeB"],
          is_empty_space_within_overlay: true,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });

      test("has selection + empty space within overlay (with Shift) → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: true,
          current_selection: ["nodeA", "nodeB"],
          is_empty_space_within_overlay: true,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });

      test("has selection + empty space outside overlay (no Shift) → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: ["nodeA"],
          is_empty_space_within_overlay: false,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });
    });

    describe("Marquee actions", () => {
      test("no selection + empty space → marquee", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: [],
          is_empty_space_within_overlay: undefined,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("marquee");
      });

      test("has selection + empty space outside overlay (with Shift) → marquee", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: true,
          current_selection: ["nodeA"],
          is_empty_space_within_overlay: false,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("marquee");
      });
    });

    describe("Documentation test cases", () => {
      test("Multi-Selection - Empty Space Drag Within Overlay (no Shift) → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: false,
          current_selection: ["nodeA", "nodeB"],
          is_empty_space_within_overlay: true,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });

      test("Multi-Selection - Empty Space Drag Within Overlay (with Shift) → drag", () => {
        const context: DragStartContext = {
          hovered_node_id: null,
          shiftKey: true,
          current_selection: ["nodeA", "nodeB"],
          is_empty_space_within_overlay: true,
        };
        const result = decideDragStartAction(context);
        expect(result).toBe("drag");
      });
    });
  });
});
