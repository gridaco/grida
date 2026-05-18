/**
 * A node identifier. Opaque to the library — consumers define their own
 * id scheme.
 */
export type NodeId = string;

/**
 * Minimal per-node view exposed by a `TreeSource`.
 *
 * - `parent` is `null` only for the root node.
 * - `children` is in document order. The flat row builder reverses it for
 *   rendering when configured (layer-panel convention) but the source
 *   itself stays in document order.
 */
export interface TreeNode<TMeta = unknown> {
  readonly id: NodeId;
  readonly parent: NodeId | null;
  readonly children: readonly NodeId[];
  readonly meta?: TMeta;
}

/**
 * A flat row produced by `controller.getRows()` — the unit of rendering.
 *
 * Stable across re-renders when the underlying source/expanded state has
 * not changed, so it is safe to pass to a virtualizer keyed by `id`.
 */
export interface Row {
  readonly id: NodeId;
  /** 0 = root, increases by 1 per nesting level. */
  readonly depth: number;
  /** Position in the flat list. Stable as long as the snapshot is stable. */
  readonly index: number;
  readonly parentId: NodeId | null;
  readonly isExpanded: boolean;
  readonly isContainer: boolean;
}

/** Where a drop would land, normalized by the controller. */
export type DropPlacement = "into" | "before" | "after";

export interface DropPosition {
  /** New parent id. For `before` / `after`, this is the over-node's parent. */
  readonly parent: NodeId;
  /** Insertion index inside `parent.children` (document order). */
  readonly index: number;
  readonly placement: DropPlacement;
  /** The node the pointer is currently over. */
  readonly over: NodeId;
}

/** Selection-mode taxonomy used by both click and keyboard. */
export type SelectionMode = "replace" | "add" | "toggle" | "range";

/** DOM-free key-event shape — anything pointer-event-like also works. */
export interface KeyEventLike {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  preventDefault?(): void;
  stopPropagation?(): void;
}

/** DOM-free modifier shape used by click handlers. */
export interface ModifierState {
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
}

export type DragMode = "move" | "copy";

/**
 * An intent emitted on the `intent` channel. Consumers handle these to
 * mutate their own document. The library never mutates anything.
 */
export type TreeIntent =
  | { readonly kind: "rename"; readonly id: NodeId }
  | { readonly kind: "delete"; readonly ids: readonly NodeId[] }
  | {
      readonly kind: "move" | "copy";
      readonly items: readonly NodeId[];
      readonly to: DropPosition;
    }
  | { readonly kind: "activate"; readonly id: NodeId };

export type ChannelName =
  | "rows"
  | "expanded"
  | "focus"
  | "drag"
  | "intent"
  | "selection";

export type Listener = () => void;
export type IntentListener = (intent: TreeIntent) => void;
