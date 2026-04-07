/**
 * Shared test utilities for grida-canvas headless testing.
 *
 * Consolidates the geometry stubs, context factories, document fixtures,
 * and node factories that were previously copy-pasted across 6+ test files.
 */
export {
  createHeadlessEditor,
  type HeadlessEditorOptions,
} from "./create-headless-editor";
export { geometryStub, createReducerContext } from "./stubs";
export {
  MINIMAL_DOCUMENT,
  createDocumentWithRects,
  createDocumentWithTextNode,
} from "./fixtures";
export {
  sceneNode,
  rectNode,
  textNode,
  containerNode,
  mockPointerEvent,
} from "./factories";
