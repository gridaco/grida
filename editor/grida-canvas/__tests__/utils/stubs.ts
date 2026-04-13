/**
 * Shared stubs for reducer-level testing.
 */
import { editor } from "@/grida-canvas";
import type { ReducerContext } from "@/grida-canvas/reducers";
import grida from "@grida/schema";

/**
 * No-op geometry stub for reducer tests.
 * Returns empty arrays for hit-testing and a fixed 100x100 rect.
 */
export const geometryStub: editor.api.IDocumentGeometryQuery = {
  getNodeIdsFromPoint: () => [],
  getNodeIdsFromPointerEvent: () => [],
  getNodeIdsFromEnvelope: () => [],
  getNodeAbsoluteBoundingRect: () => ({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  }),
  getNodeAbsoluteRotation: () => 0,
};

/**
 * Create a ReducerContext with sensible defaults for tests.
 */
export function createReducerContext(
  overrides?: Partial<ReducerContext>
): ReducerContext {
  let _snapshot: editor.state.IMinimalDocumentState | null = null;
  return {
    geometry: geometryStub,
    vector: undefined,
    viewport: { width: 1000, height: 1000 },
    backend: "dom" as const,
    paint_constraints: { fill: "fill", stroke: "stroke" },
    idgen: grida.id.noop.generator,
    gesture_snapshot: {
      get: () => _snapshot,
      set: (s: editor.state.IMinimalDocumentState | null) => {
        _snapshot = s;
      },
    },
    ...overrides,
  };
}
