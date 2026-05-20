// Core types
export type {
  NodeId,
  TreeNode,
  Row,
  DropPlacement,
  DropPosition,
  SelectionMode,
  KeyEventLike,
  ModifierState,
  DragMode,
  TreeIntent,
  ChannelName,
  Listener,
  IntentListener,
} from "./src/types";

// Source
export {
  InMemoryTreeSource,
  ancestorsOf,
  ancestorAtRowDepth,
  findByLabelPrefix,
  isContainer,
  isDescendantOf,
  nextFocusAfterRemove,
  rowDepthOf,
  subtreeMembership,
  type TreeSource,
} from "./src/source";

// Selection
export {
  InMemorySelectionAdapter,
  applySelection,
  sameSelection,
  modeFromEvent,
  type SelectionAdapter,
} from "./src/selection";

// Rows
export {
  flattenForRender,
  RowsSnapshot,
  type FlattenOptions,
} from "./src/rows";

// Constraints
export {
  allOf,
  not,
  onlyIntoContainers,
  intoNearestAncestor,
  sameParentOnly,
  disallowDescendant,
  allowWhen,
  allowAll,
  type MoveConstraint,
} from "./src/constraints";

// Drag
export {
  resolveDropPosition,
  createDrag,
  type DragHandle,
  type DragState,
} from "./src/drag";

// Geometry helpers (for consumer hit-test wiring)
export {
  placementFromY,
  desiredDepthFromX,
  passedDragThreshold,
  autoScrollDelta,
  snapToEdge,
} from "./src/geometry";

// Keymap
export {
  defaultKeymap,
  lookupAction,
  keyComboOf,
  type Keymap,
  type KeymapAction,
} from "./src/keymap";

// Controller
export { TreeController, type TreeControllerOptions } from "./src/controller";
