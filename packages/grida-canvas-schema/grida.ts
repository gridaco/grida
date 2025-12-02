import type { tokens } from "@grida/tokens";
// @ts-ignore
import type { TokenizableExcept } from "@grida/tokens/utils";
import type vn from "@grida/vn";
import cg from "@grida/cg";
import type kolor from "@grida/color";
import type tree from "@grida/tree";
import type cmath from "@grida/cmath";
import * as CSS from "csstype";

/**
 * CSSProperties definition from `@types/react`
 */
interface CSSProperties extends CSS.Properties<string | number> {
  /**
   * The index signature was removed to enable closed typing for style
   * using CSSType. You're able to use type assertion or module augmentation
   * to add properties or an index signature of your own.
   *
   * For examples and more information, visit:
   * https://github.com/frenic/csstype#what-should-i-do-when-i-get-type-errors
   */
}

export namespace grida {
  export const mixed: unique symbol = Symbol();

  export namespace id {
    export type NodeIdentifier = string;

    export interface INodeIdGenerator<T extends string | number> {
      // peek(): T;
      next(): T;
    }

    export namespace noop {
      export const generator: INodeIdGenerator<string> = {
        next: () => Math.random().toString(36).substring(2, 15),
      };
    }

    /**
     * Grida node identifier utilities.
     *
     * The identifier is a 32-bit unsigned integer composed of two fields:
     * - 8 bits: actor identifier (1-255 for online actors, 0 reserved for offline)
     * - 24 bits: per-actor node counter (0-16,777,215)
     *
     * While the packed representation is numeric, most of the JavaScript/TypeScript
     * code continues to work with string identifiers. The helpers in this namespace
     * provide safe packing, unpacking, formatting and generation utilities so that
     * the rest of the system can transition to the CRDT-friendly layout without
     * relying on random UUIDs.
     *
     * @see https://grida.co/docs/wg/feat-crdt/id
     */
    export namespace u32 {
      //

      export namespace k {
        export const ACTOR_ID_BITS = 8;
        export const NODE_COUNTER_BITS = 24;
        /**
         * 255
         */
        export const ACTOR_ID_MAX = (1 << ACTOR_ID_BITS) - 1;
        /**
         * 16,777,215
         */
        export const NODE_COUNTER_MAX = (1 << NODE_COUNTER_BITS) - 1;

        /**
         * 16,777,216
         */
        export const NODE_COUNTER_MODULO = NODE_COUNTER_MAX + 1;
        /**
         * 4,294,967,295
         */
        export const PACKED_MAX =
          ACTOR_ID_MAX * NODE_COUNTER_MODULO + NODE_COUNTER_MAX;

        /**
         * e.g. "255-16777215" or "1-42"
         */
        export const NODE_ID_SEPARATOR = "-" as const;

        /**
         * 0 is reserved for offline-local (or non collaborative) work
         */
        export const OFFLINE_ACTOR_ID: ActorId = 0;
      }

      export type ActorId = number;
      export type NodeCounter = number;
      export type PackedNodeId = number;

      export interface NodeIdComponents {
        actor: ActorId;
        counter: NodeCounter;
      }

      export type NodeIdGeneratorState = NodeIdComponents;

      /**
       * Packs the actor and node counter into a 32-bit unsigned integer.
       */
      export function pack(actor: ActorId, counter: NodeCounter): PackedNodeId {
        assertActor(actor);
        assertCounter(counter);
        return actor * k.NODE_COUNTER_MODULO + counter;
      }

      /**
       * Unpacks a packed node identifier into its actor and counter components.
       */
      export function unpack(packed: PackedNodeId): NodeIdComponents {
        assertPacked(packed);
        const actor = Math.floor(packed / k.NODE_COUNTER_MODULO);
        const counter = packed % k.NODE_COUNTER_MODULO;
        return { actor, counter };
      }

      /**
       * Creates the canonical string representation of a node identifier.
       */
      export function format(
        actor: ActorId,
        counter: NodeCounter
      ): NodeIdentifier {
        assertActor(actor);
        assertCounter(counter);
        return `${actor}${k.NODE_ID_SEPARATOR}${counter}`;
      }

      /**
       * Formats the provided components as a node identifier string.
       */
      export function fromComponents(
        components: NodeIdComponents
      ): NodeIdentifier {
        return format(components.actor, components.counter);
      }

      /**
       * Converts a packed node identifier into the canonical string representation.
       */
      export function fromPacked(packed: PackedNodeId): NodeIdentifier {
        return fromComponents(unpack(packed));
      }

      /**
       * Parses a node identifier expressed either as a string (e.g. "1:42") or as a
       * packed numeric value.
       */
      export function parse(
        input: NodeIdentifier | PackedNodeId
      ): NodeIdComponents {
        if (typeof input === "number") {
          assertPacked(input);
          return unpack(input);
        }

        const trimmed = input.trim();
        if (trimmed.length === 0) {
          throw new RangeError("Node identifier cannot be empty");
        }

        if (trimmed.includes(k.NODE_ID_SEPARATOR)) {
          const [actorPart, counterPart, ...rest] = trimmed.split(
            k.NODE_ID_SEPARATOR
          );
          if (rest.length > 0) {
            throw new RangeError(`Invalid node identifier format: "${input}"`);
          }

          const actor = Number(actorPart);
          const counter = Number(counterPart);

          if (!Number.isFinite(actor) || !Number.isFinite(counter)) {
            throw new RangeError(`Invalid node identifier: "${input}"`);
          }

          assertActor(actor);
          assertCounter(counter);
          return { actor, counter };
        }

        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric)) {
          throw new RangeError(`Invalid node identifier: "${input}"`);
        }

        assertPacked(numeric);
        return unpack(numeric);
      }

      /**
       * Converts a node identifier (string or packed) into its numeric packed form.
       */
      export function toPacked(
        input: NodeIdentifier | PackedNodeId
      ): PackedNodeId {
        if (typeof input === "number") {
          assertPacked(input);
          return input;
        }

        const { actor, counter } = parse(input);
        return pack(actor, counter);
      }

      /**
       * Returns true when the provided value is a valid packed node identifier.
       */
      export function isPackedNodeId(value: unknown): value is PackedNodeId {
        return (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= k.PACKED_MAX
        );
      }

      function assertActor(value: number): asserts value is ActorId {
        if (!Number.isInteger(value) || value < 0 || value > k.ACTOR_ID_MAX) {
          throw new RangeError(
            `Actor id must be an integer between 0 and ${k.ACTOR_ID_MAX} (received ${value})`
          );
        }
      }

      function assertCounter(value: number): asserts value is NodeCounter {
        if (
          !Number.isInteger(value) ||
          value < 0 ||
          value > k.NODE_COUNTER_MAX
        ) {
          throw new RangeError(
            `Node counter must be an integer between 0 and ${k.NODE_COUNTER_MAX} (received ${value})`
          );
        }
      }

      function assertPacked(value: number): asserts value is PackedNodeId {
        if (!Number.isInteger(value) || value < 0 || value > k.PACKED_MAX) {
          throw new RangeError(
            `Packed node id must be an integer between 0 and ${k.PACKED_MAX} (received ${value})`
          );
        }
      }

      const COUNTER_EXHAUSTED_ERROR =
        "Node counter exhausted for the current actor. Rotate to a new actor id before minting more nodes.";

      /**
       * Stateful node identifier generator.
       */
      export class NodeIdGenerator {
        private _actor: ActorId;
        private _counter: NodeCounter;

        constructor(initial: Partial<NodeIdGeneratorState> = {}) {
          const actor = initial.actor ?? k.OFFLINE_ACTOR_ID;
          const counter = initial.counter ?? 0;

          assertActor(actor);
          assertCounter(counter);

          this._actor = actor;
          this._counter = counter;
        }

        get actor(): ActorId {
          return this._actor;
        }

        get counter(): NodeCounter {
          return this._counter;
        }

        /**
         * Sets the active actor identifier for subsequent allocations.
         */
        setActor(actor: ActorId): void {
          assertActor(actor);
          this._actor = actor;
        }

        /**
         * Sets the next node counter value.
         */
        setCounter(counter: NodeCounter): void {
          assertCounter(counter);
          this._counter = counter;
        }

        /**
         * Returns true when the generator has exhausted the counter range.
         */
        get exhausted(): boolean {
          return this._counter > k.NODE_COUNTER_MAX;
        }

        /**
         * Returns the next node identifier string and advances the counter.
         */
        next(): NodeIdentifier {
          this.ensureCapacity();
          const id = format(this._actor, this._counter);
          this.advance();
          return id;
        }

        /**
         * Returns the next packed node identifier and advances the counter.
         */
        nextPacked(): PackedNodeId {
          this.ensureCapacity();
          const packed = pack(this._actor, this._counter);
          this.advance();
          return packed;
        }

        /**
         * Returns the next identifier components without allocating.
         */
        peek(): NodeIdComponents {
          this.ensureCapacity();
          return { actor: this._actor, counter: this._counter };
        }

        /**
         * Serialises the generator state so it can be restored later.
         */
        snapshot(): NodeIdGeneratorState {
          this.ensureCapacity();
          return { actor: this._actor, counter: this._counter };
        }

        /**
         * Restores the generator state from a snapshot.
         */
        restore(state: NodeIdGeneratorState): void {
          assertActor(state.actor);
          assertCounter(state.counter);
          this._actor = state.actor;
          this._counter = state.counter;
        }

        private ensureCapacity(): void {
          if (this._counter > k.NODE_COUNTER_MAX) {
            throw new RangeError(COUNTER_EXHAUSTED_ERROR);
          }
        }

        private advance(): void {
          this._counter += 1;
        }
      }
    }
  }

  export namespace program {
    export namespace schema {
      /**
       * Transforms a JSON schema `IProperties` into a strongly-typed object where scalar types are properly mapped,
       * arrays are mapped to their corresponding array types, and other types (e.g., objects) are cast as `Record<string, unknown>`.
       *
       * @template T - The schema `IProperties` to transform into a type-safe object type.
       */
      export type TInferredPropTypes<
        T extends { [key: string]: PropertyDefinition },
      > = {
        [K in keyof T]: T[K] extends TypeScalarPropertyDefinition // Handle scalar types (string, number, boolean)
          ? T[K]["type"] extends "string"
            ? string
            : T[K]["type"] extends "number"
              ? number
              : T[K]["type"] extends "boolean"
                ? boolean
                : never
          : // Handle arrays
            T[K] extends TypeArrayPropertyDefinition<any[]>
            ? Array<any>
            : // Handle custom object types
              T[K] extends TypeObjectPropertyDefinition<any>
              ? { [key: string]: any }
              : // Handle well-known object types
                T[K] extends TypeWellKnownObjectPropertyDefinition
                ? T[K]["type"] extends keyof objects.ObjectTypeMap
                  ? objects.ObjectTypeMap[T[K]["type"]]
                  : unknown
                : // Fallback to unknown
                  unknown;
      };

      export type Value =
        | tokens.NumericValueExpression
        | tokens.StringValueExpression
        | tokens.StringValueExpression[]
        | { [key: string]: Value };

      export type Properties = { [name: string]: schema.PropertyDefinition };

      export type Props = { [name: string]: Value };

      export type PropertyDefinitionType = PropertyDefinition["type"];

      export type PropertyDefinition =
        | TypeScalarPropertyDefinition
        | TypeArrayPropertyDefinition<any[]>
        | TypeObjectPropertyDefinition<any>
        | TypeWellKnownObjectPropertyDefinition;

      interface TypeScalarPropertyDefinition {
        type: "string" | "number" | "boolean";
        title?: string;
        description?: string;
        default?:
          | tokens.StringValueExpression
          | tokens.NumericValueExpression
          | tokens.BooleanValueExpression;
        required?: boolean;
        //
      }

      interface TypeArrayPropertyDefinition<T extends Array<Value>> {
        type: "array";
        title?: string;
        description?: string;
        items: PropertyDefinition;
        default?: T;
        required?: boolean;
        //
      }

      interface TypeObjectPropertyDefinition<T extends Record<string, Value>> {
        type: "object";
        title?: string;
        description?: string;
        properties: Record<string, PropertyDefinition>;
        default?: T;
        required?: boolean;
        //
      }

      interface TypeWellKnownObjectPropertyDefinition {
        type: objects.ObjectType;
        title?: string;
        description?: string;
        default?: objects.Object;
        required?: boolean;
        //
      }

      // useful when to decide clear the existing data when component / template changes.
      // if the property signature matches by the name and type (deeply), then the editor can deside to keep the existing user data.
      // function is_equal(a, b, keys){}
    }

    /**
     * common object types
     */
    export namespace objects {
      export type ObjectType = Object["type"];
      export type ObjectTypeMap = {
        richtext: Richtext;
        video: VideoSource;
        audio: AudioSource;
        image: ImageSource;
        youtube: YoutubeVideoSource;
        vimeo: VimeoVideoSource;
        facebook: FacebookVideoSource;
        rgba: RGBA32F;
      };

      export type Object = Richtext | RGBA32F | Source | VideoPlayerSource;

      export type Richtext = {
        type: "richtext";
        html: string;
      };

      export type RGBA32F = {
        type: "rgbaf";
        r: number;
        g: number;
        b: number;
        a: number;
      };

      export type Source = ImageSource | VideoSource | AudioSource;

      export type VideoSource = {
        type: "video";
        src: string;
      };

      export type AudioSource = {
        type: "audio";
        src: string;
      };

      export type ImageSource = {
        type: "image";
        src: string;
      };

      export type VideoPlayerSource =
        | YoutubeVideoSource
        | VimeoVideoSource
        | FacebookVideoSource;

      export type YoutubeVideoSource = {
        type: "youtube";
        url: string;
      };

      export type VimeoVideoSource = {
        type: "vimeo";
        url: string;
      };

      export type FacebookVideoSource = {
        type: "facebook";
        url: string;
      };
    }
  }
}

export namespace grida.program.document {
  export const SCHEMA_VERSION = "0.0.1-beta.2+20251201";

  /**
   * Simple Node Selector
   *
   * - "*" - all nodes
   * - "~" - siblings of current selection
   *    - does not include the current selection
   *    - if multiple selection, this is only valid if all selected nodes are siblings
   * - ">" - children of current selection
   * - "~+" - next sibling of current selection
   * - "~-" - previous sibling of current selection
   * - "selection" - current selection
   * - [] - specific nodes
   *
   * @example
   * - Select all nodes: "*"
   * - Select siblings of current selection: "~"
   * - Select self and siblings: ["selection", "~"]
   * - Select children of current selection: ">"
   */
  export type Selector =
    | "*"
    | "~"
    | "~+"
    | "~-"
    | ">"
    | ".."
    | "selection"
    | nodes.NodeID[];

  export namespace k {
    /**
     * Key for the data attribute that stores the node ID in the HTML document.
     *
     * @see {@link INodeHtmlDocumentQueryDataAttributes}
     */
    export const HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY =
      "data-grida-node-id";

    /**
     * Key for the data attribute that stores the node {@link nodes.Node.locked} in the HTML document.
     *
     * @see {@link INodeHtmlDocumentQueryDataAttributes}
     */
    export const HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_LOCKED_KEY =
      "data-grida-node-locked";
  }

  /**
   * general purpose cascading document properties for envs, styles, constants, etc.
   */
  export interface IDocumentProperties {
    /**
     * document level properties / variables
     */
    properties: schema.Properties;
  }

  /**
   * contains all original template definition under this defined document in k:v pair
   */
  export interface IDocumentTemplatesRepository {
    /**
     * user registered templates
     */
    templates?: Record<string, template.TemplateDocumentDefinition>;
  }

  export interface IOverridesRepository {
    /**
     * instance's exposed child node overrides
     */
    overrides: Record<nodes.NodeID, nodes.NodeChange>;
  }

  /**
   * contains all nodes under this defined document in k:v pair
   *
   * @see {@link IDocumentDefinition}
   */
  export interface INodesGraph {
    nodes: Record<nodes.NodeID, nodes.Node>;
    links: Record<nodes.NodeID, nodes.NodeID[] | undefined>;
  }

  export type ImageType =
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif";

  /**
   * reference to an registered image
   */
  export type ImageRef = {
    type: ImageType;
    url: string;
    width: number;
    height: number;
    bytes: number;
  };

  /**
   * contains all images (ref) under this defined document in k:v pair
   *
   * @see {@link IDocumentDefinition}
   */
  export interface IImagesRepository {
    images: Record<string, ImageRef>;
  }

  /**
   * contains all bitmaps (data) under this defined document in k:v pair
   *
   * @see {@link IDocumentDefinition}
   */
  export interface IBitmapsRepository {
    bitmaps: Record<
      string,
      cmath.raster.Bitmap & {
        version: number;
      }
    >;
  }

  /**
   * background color of the scene
   */
  export interface ISceneBackground {
    /**
     * This property may not be handled, or fallback to white #FFFFFF depending on the rendering context.
     */
    background_color?: kolor.colorformats.RGBA32F | null | undefined | "";
  }

  export interface Guide2D {
    readonly axis: cmath.Axis;
    offset: number;
  }

  export interface I2DGuides {
    guides: Array<Guide2D>;
  }

  export type EdgePointPosition2D = {
    type: "position";
    x: number;
    y: number;
  };

  export type EdgePointNodeAnchor = {
    type: "anchor";
    target: nodes.NodeID;
  };

  export type EdgePoint = EdgePointPosition2D | EdgePointNodeAnchor;

  export interface Edge2D {
    id: string;
    readonly type: "edge";
    a: EdgePoint;
    b: EdgePoint;
  }

  export interface IEdges {
    edges: Array<Edge2D>;
  }

  /**
   * Represents a normalized document structure where all nodes are stored in a flat map
   * with a single `root_id` as the entry point for traversal.
   *
   * @remarks
   * This structure is designed to improve efficiency and scalability by avoiding deep nesting.
   * Instead of storing child nodes within each parent node (deeply nested children), we store
   * all nodes in a flat `Record<string, Node>` and reference child nodes by their IDs. This
   * setup allows for constant-time access to nodes, simplifies updates, and enhances compatibility
   * with React's rendering model.
   *
   * ## Benefits of a Flat Structure over Nested Children:
   * 1. **Performance and Efficiency**:
   *    - **Constant-Time Lookup**: Storing nodes in a flat map (`nodes: Record<string, Node>`) allows
   *      for quick lookups by ID with `O(1)` access time, regardless of the document's complexity or depth.
   *    - **Simplified Updates**: With each node accessible directly by ID, modifications do not require
   *      traversing deeply nested structures, reducing the computational cost of updates.
   *
   * 2. **Compatibility with React**:
   *    - **Minimized Re-renders**: In React, deeply nested structures can trigger unnecessary re-renders
   *      across the component tree. A flat structure allows React components to request only the specific
   *      node data they need, which reduces re-renders and optimizes the virtual DOM diffing process.
   *    - **Memoization-Friendly**: By accessing nodes through IDs rather than deeply nested props,
   *      components can be memoized effectively, re-rendering only when the specific node data they depend on changes.
   *
   * 3. **Scalability and Flexibility**:
   *    - This normalized structure is easier to scale, allowing for flexible hierarchical changes (e.g., moving
   *      nodes, reordering) without requiring deep restructuring.
   *    - Maintaining a `root_id` as the document's starting point simplifies traversal, ensuring that
   *      complex documents can still be navigated in a straightforward manner.
   *
   * ## Querying Nodes Efficiently
   * - Developers should access nodes through the `nodes` map using their unique IDs, starting from `root_id`.
   * - Traversal operations (e.g., rendering the document tree) can begin from `root_id` and recursively fetch child nodes by referencing `children` arrays in each `Node`.
   * - If frequent queries are necessary (e.g., repeated lookups in deeply nested areas), consider memoizing the result of these queries or using selector functions.
   *
   * ## Using in React Efficiently
   * - **React Context**: To avoid prop drilling, consider placing the `nodes` map in a React Context, allowing deeply nested components to access nodes by ID without passing them as props.
   * - **Memoized Selectors**: Use `useMemo` or selector functions (e.g., with libraries like Reselect) to derive specific subtrees or frequently accessed nodes, avoiding redundant calculations on each render.
   * - **Component Memoization**: Use `React.memo` or `useMemo` on components accessing nodes by ID to limit re-renders. This way, only components with changing dependencies re-render.
   *
   * @example
   * ```typescript
   * // Basic structure example:
   * const document: NormalizedNodeDocument = {
   *   root_id: "1",
   *   nodes: {
   *     "1": { id: "1", type: "container", children: ["2", "3"] },
   *     "2": { id: "2", type: "text", children: [] },
   *     "3": { id: "3", type: "image", children: [] },
   *   }
   * };
   *
   * // Example query: Render a node and its children
   * function NodeComponent({ id }: { id: string }) {
   *   const node = document.nodes[id];
   *   return (
   *     <div>
   *       <p>{node.type}</p>
   *       {node.children.map((childId) => (
   *         <NodeComponent key={childId} id={childId} />
   *       ))}
   *     </div>
   *   );
   * }
   * ```
   */
  export interface IDocumentDefinition
    extends IImagesRepository,
      IBitmapsRepository,
      document.INodesGraph,
      IDocumentProperties {
    // scene: Scene;
  }

  /**
   * [Grida Document Model]
   *
   * Grida document contains all nodes, properties, and embedded data required to render a complete document.
   *
   * **Note on scenes**: Scenes are stored as SceneNode in `nodes`, and referenced by ID in `scenes_ref`.
   * The `nodes` collection is the single source of truth for all node-like data including scenes.
   */
  export interface Document extends IDocumentDefinition {
    /**
     * Array of scene node IDs. Scene nodes themselves are stored in `nodes` as SceneNode.
     * Use `scenes_ref.map(id => nodes[id] as SceneNode)` to access scene data.
     */
    scenes_ref: string[];
    /**
     * The currently active/entry scene ID.
     */
    entry_scene_id?: string;
  }

  /**
   * [Packed Scene Document] A.K.A single scene document
   *
   * this is a portable document model with primary scene, used for in-memory operations. like import, copy-paste, drag-drop, etc.
   */
  export interface IPackedSceneDocument extends IDocumentDefinition {
    scene: Scene;
  }

  /**
   * The [Scene] node. (a.k.a Page) this is defined directly without the repository. hence, its id is not required to be globally unique across the nodes.
   *
   * @deprecated This interface is being migrated to {@link nodes.SceneNode} which is stored in the nodes repository.
   * The Scene interface is kept for backward compatibility during the migration period.
   * New code should use SceneNode stored in document.nodes instead of document.scenes.
   */
  export interface Scene
    extends document.ISceneBackground,
      document.I2DGuides,
      document.IEdges {
    type: "scene";

    /**
     * the scene identifier - the id is only required to be unique across the current document scenes.
     * (it is not required to be globally unique within the nodes)
     */
    readonly id: string;

    /**
     * the user-friendly name of the scene
     */
    name: string;

    /**
     * the children of the scene. each children must be registreed in the node repository under the document where this scene is defined.
     */
    children_refs: nodes.NodeID[];
    constraints: {
      children: "single" | "multiple";
    };

    /**
     * optional order of the scene
     */
    order?: number;
  }

  /**
   * Minimal Scene Definition for API usage (and for older versions)
   *
   * will follow the default values of {@link Scene} for missing properties.
   */
  export type SceneInit = Partial<Scene> & Pick<Scene, "id">;

  /**
   * initializes a minimal scene definition
   * @param init minimal scene definition
   * @returns a compatible scene definition
   */
  export function init_scene(init: SceneInit): grida.program.document.Scene {
    return {
      // default, fallback values
      type: "scene",
      guides: [],
      edges: [],
      constraints: { children: "multiple" },
      children_refs: [],
      ...init,
    } as grida.program.document.Scene;
  }

  export namespace internal {
    /**
     * @internal
     * Nodes repository runtime hierarchy context for efficient hierarchical queries on flat document structures.
     *
     * This interface is designed for **in-memory, runtime-only** use and should not be used for persisting data.
     * It exists to provide efficient access to the parent and child relationships within the document tree without
     * modifying the core node structure directly.
     *
     * ## Why We Use This Interface
     * This interface allows for a structured, performant way to manage node hierarchy relationships without introducing
     * a `parent_id` property on each `Node`. By using an in-memory context, we avoid potential issues with nullable
     * `parent_id` fields, which could lead to unpredictable coding experiences. Additionally, maintaining these
     * relationships within a dedicated context layer promotes separation of concerns, keeping core node definitions
     * stable and interface-compatible.
     *
     * ## Functionality
     * - **Get Parent Node by Child ID**: Efficiently map a node's ID to its parent node ID with O(1) lookup.
     * - **Get Child Nodes by Parent ID**: Access a list of child node IDs for any given parent node with O(1) lookup.
     * - **Traverse Ancestors**: Walk up the tree from any node to its root.
     * - **Query Depth**: Calculate how deep a node is in the hierarchy.
     * - **Find Siblings**: Locate nodes that share the same parent.
     *
     * ## Management Notes
     * - This interface should be populated and managed only during runtime.
     * - It is recommended to initialize the lookup table during document tree loading or initial rendering.
     * - If the node hierarchy is updated (e.g., nodes are added, removed, or moved), this context should be refreshed
     *   to reflect the current relationships.
     * - For optimal performance, the context should be created once and reused for multiple queries.
     *
     */
    export type INodesRepositoryRuntimeHierarchyContext = tree.lut.ITreeLUT;
  }

  export interface INodeHtmlDocumentQueryDataAttributes {
    id: nodes.Node["id"];
    [k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY]: nodes.Node["id"];
    [k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_LOCKED_KEY]: nodes.Node["locked"];
    ["data-grida-node-type"]: nodes.Node["type"];
  }

  /**
   * wraps node data with document query-able extra data.
   * this is essential when using html backend.
   *
   * grida canvas overlay will use these attributes to determine if the raycasted element is a valid node.
   */
  type INodeWithHtmlDocumentQueryDataAttributes<N extends nodes.Node> =
    INodeHtmlDocumentQueryDataAttributes & N;

  export type IGlobalRenderingContext = {
    context: IBitmapsRepository;
  };

  /**
   * final props that matches the react rendering signature
   */
  export type IComputedNodeReactRenderProps<N extends nodes.Node> =
    IGlobalRenderingContext &
      INodeWithHtmlDocumentQueryDataAttributes<N> & {
        style: CSSProperties;
        //
      };

  /**
   * Definition:
   *
   * A Template is unser-written ReactComponent for complex and custom logics and styles, sub components, while allowing user to modify the exposed details by building the template with mixture of {@link nodes.Node} and JSX.
   *
   * - A template is a user-written ReactComponent
   * - A template can have properties like component node, but the props are managed by the grida engine.
   * - User may also have its own props that are independent from the engine, but needs to be passed via non-shared custom context.
   * - A template can have its own children, either can be a normal JSX or a {@link nodes.Node}
   * - {@link nodes.Node} children under a template are exposed and can be modified by the editor
   * - A template can be used as document root.
   * - A template cannot be nested under another template.
   */
  export namespace template {
    export interface IUserDefinedTemplateNodeReactComponentRenderProps<P>
      extends nodes.i.IBaseNode,
        nodes.i.ISceneNode,
        nodes.i.ICSSStylable,
        nodes.i.IExpandable {
      props: P;
    }

    export interface TemplateDocumentDefinition<
      P extends schema.Properties = schema.Properties,
    > extends INodesGraph {
      /**
       * @deprecated - rename to template_id
       */
      name: string;
      version: string;
      type: "template";
      properties: P;
      default: Record<string, schema.Value>;
    }
  }
}
/**
 * Supported CSS properties and types
 */
export namespace grida.program.css {
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/length
   */
  export type Length =
    | number
    | {
        type: "length";
        /**
         * only supports the following units:
         * - px
         * - vw
         * - vh
         * - dvw
         * - dvh
         * - em
         * - rem
         */
        unit: "px" | "vw" | "vh" | "dvw" | "dvh" | "em" | "rem";
        value: number;
      };

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/percentage
   */
  export type Percentage = {
    type: "percentage";
    value: number;
  };

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/length-percentage
   */
  export type LengthPercentage = Length | Percentage;

  /**
   * Partially supported CSS border model.
   * - each border can have different width
   * - color is shared
   * - only `solid` `dashed` border is supported
   */
  export type Border = {
    borderStyle: "none" | "solid" | "dashed";
    borderColor: cg.RGBA32F;
    /**
     * @example
     * ```css
     * border-width: <length>
     * border-width: top | right | bottom | left
     * ```
     *
     */
    borderWidth:
      | number
      | {
          top: number;
          right: number;
          bottom: number;
          left: number;
        };
  };

  /**
   * CSS properties that is supported via the standard editor
   *
   * (when using html backend, other css properties can also be dynamically applied, but not guaranteed)
   *
   * Note: some prorperties must not be set directly, e.g. `opacity` as it is a valid property for both html backend and canvas backend, we handle this in a higher level.
   * When set explicitly, it will override the default behaviour, causing unexpected results.
   *
   * Common properties to avoid setting directly:
   * - `opacity`
   * - `z-index`
   * - `cursor`
   * - `position`
   * - `width`
   * - `height`
   * - `top`
   * - `left`
   * - `pointer-events`
   * - `border-radius`
   * - `fill`
   * - `objectFit`
   *
   *
   * @deprecated Note: Do not modify this directly - it will progressively be replaced by a more robust and universal CSS property type system.
   * If you wish to add a complex styled node, try using {@link template.TemplateDocumentDefinition}
   */
  export type ExplicitlySupportedCSSProperties = Partial<
    Pick<
      // TODO: Drop the React dependency and use css-types instead
      CSSProperties,
      // explicitly prohibited
      // - "opacity"
      // - "zIndex"
      // - "width"
      // - "height"
      // - "position"
      // - "left"
      // - "top"
      // - "right"
      // - "bottom"
      // - "cursor"
      // - "pointerEvents"
      // - "borderRadius"
      //
      // position & dimension
      // | 'width' | 'height' | 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight' | 'position' | 'top' | 'right' | 'bottom' | 'left' | 'zIndex'
      // | "position"
      // | "width"
      // | "height"
      // | "top"
      // | "left"
      //
      // | "textTransform"
      //
      // | "boxShadow"
      //
      | "aspectRatio"
      //
      | "overflow"
      //
      // | "margin"
      // | "flexWrap"
      //
    >
  >;
}

export namespace grida.program.nodes {
  export type NodeID = id.NodeIdentifier;
  export type NodeType = Node["type"];

  export type Node =
    | SceneNode
    | BooleanPathOperationNode
    | GroupNode
    | TextNode
    | ImageNode
    | VideoNode
    | ContainerNode
    | HTMLIFrameNode
    | HTMLRichTextNode
    | BitmapNode
    | SVGPathNode
    | VectorNode
    | LineNode
    | RectangleNode
    | EllipseNode
    | RegularPolygonNode
    | RegularStarPolygonNode
    | ComponentNode
    | InstanceNode
    | TemplateInstanceNode;

  export type ComputedNode =
    | ComputedTextNode
    | ComputedBitmapNode
    | ComputedImageNode
    | ComputedVideoNode
    | ComputedContainerNode
    | ComputedHTMLIFrameNode
    | ComputedHTMLRichTextNode
    | ComputedSVGPathNode
    | ComputedVectorNode
    | ComputedLineNode
    | ComputedRectangleNode
    | ComputedEllipseNode
    | ComputedComponentNode
    | ComputedInstanceNode
    | ComputedTemplateInstanceNode;

  /**
   * Unknwon node utility type - use within the correct context
   */
  export type UnknwonComputedNode = Omit<
    Partial<ComputedTextNode> &
      Partial<ComputedImageNode> &
      Partial<ComputedBitmapNode> &
      Partial<ComputedVideoNode> &
      Partial<ComputedContainerNode> &
      Partial<ComputedHTMLIFrameNode> &
      Partial<ComputedHTMLRichTextNode> &
      Partial<ComputedSVGPathNode> &
      Partial<ComputedVectorNode> &
      Partial<ComputedLineNode> &
      Partial<ComputedRectangleNode> &
      Partial<ComputedEllipseNode> &
      Partial<ComputedComponentNode> &
      Partial<ComputedInstanceNode> &
      Partial<ComputedTemplateInstanceNode>,
    "type"
  > & {
    readonly type: NodeType;
  } & i.IBaseNode &
    i.ISceneNode;

  /**
   * Unknwon node utility type - use within the correct context
   */
  export type UnknwonNode = Omit<
    Partial<BooleanPathOperationNode> &
      Partial<GroupNode> &
      Partial<TextNode> &
      Partial<BitmapNode> &
      Partial<ImageNode> &
      Partial<VideoNode> &
      Partial<ContainerNode> &
      Partial<HTMLIFrameNode> &
      Partial<HTMLRichTextNode> &
      Partial<SVGPathNode> &
      Partial<VectorNode> &
      Partial<LineNode> &
      Partial<RectangleNode> &
      Partial<EllipseNode> &
      Partial<RegularPolygonNode> &
      Partial<RegularStarPolygonNode> &
      Partial<ComponentNode> &
      Partial<InstanceNode> &
      Partial<TemplateInstanceNode>,
    "type"
  > & {
    readonly type: NodeType;
  } & i.IBaseNode &
    i.ISceneNode;

  export type UnknownNodeProperties<T = unknown> = Record<keyof UnknwonNode, T>;

  // #region node prototypes

  export type BooleanPathOperationNodePrototype = __TPrototypeNode<
    Omit<
      Partial<BooleanPathOperationNode>,
      __base_scene_node_properties | "children"
    > &
      __IPrototypeNodeChildren
  >;

  export type GroupNodePrototype = __TPrototypeNode<
    Omit<Partial<GroupNode>, __base_scene_node_properties | "children"> &
      __IPrototypeNodeChildren
  >;
  export type TextNodePrototype = __TPrototypeNode<
    Omit<Partial<TextNode>, __base_scene_node_properties>
  >;
  export type ImageNodePrototype = __TPrototypeNode<
    Omit<Partial<ImageNode>, __base_scene_node_properties>
  >;
  export type VideoNodePrototype = __TPrototypeNode<
    Omit<Partial<VideoNode>, __base_scene_node_properties>
  >;
  export type ContainerNodePrototype = __TPrototypeNode<
    Omit<Partial<ContainerNode>, __base_scene_node_properties | "children"> &
      __IPrototypeNodeChildren
  >;
  export type PathNodePrototype = __TPrototypeNode<
    Omit<Partial<VectorNode>, __base_scene_node_properties>
  >;
  export type LineNodePrototype = __TPrototypeNode<
    Omit<Partial<LineNode>, __base_scene_node_properties>
  >;
  export type RectangleNodePrototype = __TPrototypeNode<
    Omit<Partial<RectangleNode>, __base_scene_node_properties>
  >;
  export type EllipseNodePrototype = __TPrototypeNode<
    Omit<Partial<EllipseNode>, __base_scene_node_properties>
  >;
  export type PolygonNodePrototype = __TPrototypeNode<
    Omit<Partial<RegularPolygonNode>, __base_scene_node_properties>
  >;
  export type StarNodePrototype = __TPrototypeNode<
    Omit<Partial<RegularStarPolygonNode>, __base_scene_node_properties>
  >;

  /**
   * A virtual, before-instantiation node that only stores the prototype of a node.
   *
   * Main difference between an actual node or node data is, a prototype is only required to have a partial node data, and it has its own hierarchy of children.
   */
  export type NodePrototype =
    | BooleanPathOperationNodePrototype
    | GroupNodePrototype
    | TextNodePrototype
    | ImageNodePrototype
    | VideoNodePrototype
    | ContainerNodePrototype
    | __TPrototypeNode<
        Omit<Partial<HTMLIFrameNode>, __base_scene_node_properties>
      >
    | __TPrototypeNode<
        Omit<Partial<HTMLRichTextNode>, __base_scene_node_properties>
      >
    | __TPrototypeNode<Omit<Partial<BitmapNode>, __base_scene_node_properties>>
    | __TPrototypeNode<Omit<Partial<SVGPathNode>, __base_scene_node_properties>>
    | PathNodePrototype
    | LineNodePrototype
    | RectangleNodePrototype
    | EllipseNodePrototype
    | PolygonNodePrototype
    | StarNodePrototype
    | __TPrototypeNode<
        Omit<
          Partial<ComponentNode>,
          __base_scene_node_properties | "children"
        > &
          __IPrototypeNodeChildren
      >
    | __TPrototypeNode<
        Omit<Partial<InstanceNode>, __base_scene_node_properties | "children"> &
          __IPrototypeNodeChildren
      >
    | __TPrototypeNode<
        Omit<Partial<TemplateInstanceNode>, __base_scene_node_properties>
      >;

  /**
   * @internal Prototype node can't have an id, and can optionally have BaseNode and SceneNode properties.
   * Other properties are required.
   */
  type __TPrototypeNode<T> = Partial<Omit<i.IBaseNode, "id">> &
    Partial<i.ISceneNode> & {
      /**
       * force the id for instanciation (optional)
       */
      readonly _$id?: string;
    } & T;

  type __base_scene_node_properties =
    | "id"
    | "name"
    | "userdata"
    | "active"
    | "locked";

  type __IPrototypeNodeChildren = {
    children: NodePrototype[];
  };

  /**
   * Type guard to check if a prototype has children.
   * Provides type safety for prototype-to-document conversion.
   */
  export function hasChildren(
    prototype: Partial<NodePrototype>
  ): prototype is Partial<NodePrototype> & __IPrototypeNodeChildren {
    return "children" in prototype && Array.isArray(prototype.children);
  }

  // #endregion node prototypes

  /**
   * Type for containing instance's node changes data relative to master node
   */
  export type NodeChange = Partial<nodes.Node> | undefined;

  export namespace i {
    export interface IBaseNode {
      readonly id: NodeID;
      name: string;

      /**
       * user-injected custom data
       */
      userdata?: Record<string, unknown> | undefined | null;
    }

    export interface ISceneNode {
      /**
       * whether this node is active within the editor context
       *
       * when active is false, its content will not be included in the runtime tree
       *
       * its exact behaviour varies by the environment
       *
       * @default true
       * @example when false, display:none or not included in the tree
       */
      active: boolean;

      /**
       * whether this node is locked
       *
       * when the node is locked, on editor environment, the node cannot be selected or edited via viewport
       *
       * on production environment, this property is ignored
       *
       * @default false
       * @example when true, pointer-events:none
       * @internal
       */
      locked: boolean;

      /**
       * whether this node is removable (if not remove action will trigger active=false)
       *
       * currently, this will only be prevented when the node is a root-level node, and the delete is directly triggered to it.
       *
       * @default false
       */
      removable?: boolean;
    }

    export namespace props {
      /**
       * text value
       *
       * - expression - {@link tokens.StringValueExpression} - computed or literal
       *   - literal - e.g. `"A text value"`
       *   - property access - {@link tokens.PropertyAccessExpression} - computed, , e.g. `userdata.title`
       *   - identifier - {@link tokens.Identifier} - computed, e.g. `title`
       *   - others - all {@link tokens.StringValueExpression} types
       *
       * when used under a component / instance / template, the `props.` expression is reserved and refers to adjacent parent's props.
       * - by the standard implementation, the `props.[x]` is recommended to be referenced only once in a single node.
       * - by the standard implementation, within the visual editor context, when user attempts to updates the literal value (where it is a `props.[x]` and `props.[x] is literal`), it should actually update the `props.[x]` value, not this `text` literal value.
       */
      export type PropsTextValue = tokens.StringValueExpression;

      export type SolidPaintToken = TokenizableExcept<cg.SolidPaint, "type">;

      export type PropsPaintValue = cg.Paint | SolidPaintToken;
    }

    export interface IBlend {
      /**
       * opacity of the node.
       *
       * Env:
       * - on html backend, this value is passed the the style `opacity` property
       * - on canvas backend, this value is passed to the `opacity` property of the node
       *
       * @default 1
       */
      opacity: number;

      /**
       * layer blend mode
       *
       * @default "pass-through"
       */
      blend_mode?: cg.LayerBlendMode;
    }

    export interface ILayerMaskType {
      /**
       * @default undefined
       */
      mask?: cg.LayerMaskType | null | undefined;
    }

    export interface IZIndex {
      /**
       * z-index of the node.
       *
       *
       * Env:
       * - on html backend, this value is passed the the style `z-index` property
       * - on canvas backend, this value is used to determine the depth / z buffer
       *
       * Terms - Also knwon as:
       * - Sorting Order
       * - Depth
       * - Z Buffer
       * - Order in Layer
       *
       * @default 0
       * @type {number} integer
       */
      z_index: number;
    }

    /**
     * specifies node's x rotation in degrees
     */
    export interface IRotation {
      /**
       * rotation in degrees
       *
       * @default 0
       */
      rotation: number;
    }

    /**
     * Node that can be expanded in hierarchy
     */
    export interface IExpandable {
      expanded: boolean;
    }

    /**
     * Node that can be exported
     *
     * @deprecated - not ready - do not use in production
     */
    export interface IExportable {}

    /**
     * Corner radius
     */
    export interface ICornerRadius {
      corner_radius?: number;
    }

    /**
     * Rectangle Corner
     */
    export interface IRectangularCornerRadius {
      corner_radius_top_left?: number;
      corner_radius_top_right?: number;
      corner_radius_bottom_left?: number;
      corner_radius_bottom_right?: number;
      cornerSmoothing?: number;
    }

    /**
     * padding
     */
    export interface IPadding {
      padding:
        | number
        | {
            padding_top: number;
            padding_right: number;
            padding_bottom: number;
            padding_left: number;
          };
    }

    /**
     *
     * Defines the layout behavior of the container.
     * - `flex`: Enables Flexbox-like behavior.
     * - `flow`: Equivalent to "block" in CSS, where elements are arranged in normal document flow.
     * @see https://developer.mozilla.org/en-US/docs/Glossary/Flex_Container
     * @see https://api.flutter.dev/flutter/widgets/Flex-class.html
     */
    export interface IFlexContainer {
      /**
       * the flex container only takes effect when layout is set to `flex`
       */
      layout: "flex" | "flow";

      /**
       *
       * the flex model direction - takes effect when layout is set to `flex`
       *
       * @default "horizontal"
       */
      direction: cg.Axis;

      /**
       *
       * the flex model wrap behavior - takes effect when layout is set to `flex`
       *
       * @default "nowrap"
       */
      layout_wrap?: "wrap" | "nowrap";

      /**
       *
       * the flex model main axis alignment - takes effect when layout is set to `flex`
       *
       * @default "start"
       */
      main_axis_alignment: cg.MainAxisAlignment;

      /**
       *
       * the flex model cross axis alignment - takes effect when layout is set to `flex`
       *
       * @default "start"
       */
      cross_axis_alignment: cg.CrossAxisAlignment;

      /**
       * the gap between the children in main axis - takes effect when layout is set to `flex`
       *
       * commonly refered as `row-gap` (in row direction) or `column-gap` (in column direction)
       *
       * @default 0
       */
      main_axis_gap: number;

      /**
       * the gap between the children in cross axis - takes effect when layout is set to `flex`
       *
       * commonly refered as `column-gap` (in row direction) or `row-gap` (in column direction)
       *
       * @default 0
       */
      cross_axis_gap: number;
    }

    /**
     * Node wih Box Fit `fit`, a.k.a. `object-fit`
     */
    export interface IBoxFit {
      fit: cg.BoxFit;
    }

    /**
     * Node that can be filled with color - such as rectangle, ellipse, etc.
     */
    export interface IFill<T> {
      // FIXME: make it nullable
      fill?: T | undefined;
      /**
       * Multiple paint fills. When defined, the first entry should mirror the
       * single {@link fill} value for backwards compatibility with DOM
       * backends that only support a single fill.
       */
      fills?: T[] | undefined;
    }

    export interface IEffects {
      feBlur?: cg.FeLayerBlur;
      feBackdropBlur?: cg.FeBackdropBlur;
      feShadows?: cg.FeShadow[];
      feLiquidGlass?: cg.FeLiquidGlass;
      feNoises?: cg.FeNoise[];
    }

    export interface IEllipseArcData {
      /**
       * angle of the sweep in degree
       * @default 360
       *
       * @example
       * - 0 - no circle
       * - 180 - half circle
       * - 360 - full circle
       */
      angle: number;

      /**
       * start angle in degree
       * @default 0
       */
      angle_offset: number;

      /**
       * inner radius in 0~1
       * @default 0
       */
      inner_radius: number;
    }

    /**
     * Node that supports stroke with color - such as rectangle, ellipse, etc.
     */
    export interface IStroke {
      stroke?: cg.Paint;
      /**
       * Multiple stroke paints. Similar to {@link IFill.fills}, the first
       * stroke is mirrored via {@link stroke} for single-stroke backends.
       */
      strokes?: cg.Paint[];

      /**
       * stroke width - 0 or greater
       */
      stroke_width: number;

      /**
       * variable width stroke width profile
       */
      stroke_width_profile?: cg.VariableWidthProfile;

      /**
       * stroke alignment - takes effect when stroke is set
       */
      stroke_align?: cg.StrokeAlign;

      /**
       * stroke dash pattern - array of dash and gap lengths
       *
       * The pattern defines alternating lengths of dashes and gaps.
       * - Even indices (0, 2, 4, ...): dash lengths
       * - Odd indices (1, 3, 5, ...): gap lengths
       *
       * @example [5, 5] - 5px dash, 5px gap
       * @example [10, 5, 2, 5] - 10px dash, 5px gap, 2px dot, 5px gap
       * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray
       */
      stroke_dash_array?: number[];

      /**
       * @default "butt"
       */
      stroke_cap: cg.StrokeCap;

      /**
       * @default "miter"
       */
      stroke_join: cg.StrokeJoin;

      /**
       * stroke miter limit - 0 or greater
       * @default 4
       */
      stroke_miter_limit?: number;
    }

    /**
     * Rectangular node (rectangle, image, video, container) specific stroke width properties
     */
    export interface IRectangularStrokeWidth {
      /**
       * sets or overrides the top stroke width
       */
      stroke_top_width?: number;
      /**
       * sets or overrides the right stroke width
       */
      stroke_right_width?: number;
      /**
       * sets or overrides the bottom stroke width
       */
      stroke_bottom_width?: number;
      /**
       * sets or overrides the left stroke width
       */
      stroke_left_width?: number;
    }

    /**
     * - [Env:HTML] for html text, `-webkit-text-stroke` will be used
     */
    export interface ITextStroke {
      stroke?: cg.Paint;
      strokes?: cg.Paint[];
      /**
       * stroke width - 0 or greater
       */
      stroke_width?: number;
      /**
       * stroke alignment - takes effect when stroke is set
       */
      stroke_align?: cg.StrokeAlign;
    }

    export interface ICSSBorder {
      border?: css.Border | undefined;
    }

    export interface IStylable<S extends Record<string, unknown>> {
      style: S;
    }

    /**
     * @deprecated
     */
    export interface ICSSStylable
      extends IStylable<css.ExplicitlySupportedCSSProperties>,
        IBlend,
        ILayerMaskType,
        IRotation,
        IZIndex,
        IPositioning,
        ICSSDimension,
        IFill<props.PropsPaintValue>,
        ICSSBorder {
      /**
       * TODO: rename to css
       * @deprecated
       */
      style: css.ExplicitlySupportedCSSProperties;
    }

    /**
     * @deprecated
     */
    export interface IComputedCSSStylable
      extends __ReplaceSubset<
        ICSSStylable,
        IFill<props.PropsPaintValue>,
        { fill: cg.Paint }
      > {}

    export interface IMouseCursor {
      cursor?: cg.SystemMouseCursor;
    }

    export interface IHrefable {
      href?: string;
      target?: "_self" | "_blank" | undefined;
    }

    /**
     * does not represent any specific rule or logic, just a data structure, depends on the context
     */
    export interface IFixedDimension {
      width: number;
      height: number;
    }

    export interface ICSSDimension {
      width: css.LengthPercentage | "auto";
      height: css.LengthPercentage | "auto";
    }

    /**
     * Relative DOM Positioning model
     *
     * by default, use position: relative, left: 0, top: 0 - to avoid unexpected layout issues
     */
    export interface IPositioning {
      position: "absolute" | "relative";
      left?: number | undefined;
      top?: number | undefined;
      right?: number | undefined;
      bottom?: number | undefined;
      // x: number;
      // y: number;
    }

    /**
     * Font Style
     *
     * this is a abstract font-related style container, where this subset of text style attrutes are hightly likely change within this scope, as font family or font (postscript) / instance change.
     */
    export interface IFontStyle {
      font_family?: string;
      font_size: number;
      /**
       * font weight
       *
       * when set for VF font, the variation `wght` will also be set. - this always overrides the `wght` if different.
       *
       * @default 400
       */
      font_weight: cg.NFontWeight | number;

      /**
       * font width
       *
       * font width is high level exposure for `wdth` variable axis.
       * this is effectively no-op if the font does not support `wdth` feature.
       *
       * @default undefined
       *
       */
      font_width?: number;

      /**
       * font optical sizing
       *
       * when set for VF font, the variation `opsz` will also be set. - this always overrides the `opsz` if different.
       *
       * @default "auto"
       */
      font_optical_sizing?: cg.OpticalSizing;

      /**
       * Font kerning mode
       *
       * this controls the font feature `kern` this serves as high-level `kern` switch.
       * this is effectively no-op if the font does not support `kern` feature.
       *
       * @default `normal`
       */
      font_kerning: cg.FontKerningFlag;

      /**
       * OpenType features
       * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings
       */
      font_features?: Partial<Record<cg.OpenTypeFeature, boolean>>;
      /**
       * custom font variations
       * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings
       */
      font_variations?: Record<string, number>;

      // #region semantics
      /**
       * if the font face is italic (or italic style is requested)
       * this depends on how editor reloves the font.
       *
       * best practice is to set this true, only the font is italic. (defined by OS/2 fsSelection)
       * in a variable font scenario, this can be set true, even if fsSelection is not set to italic.
       *
       * if the used fvar.instance is semantically italic, this can be set true.
       */
      font_style_italic?: boolean;

      /**
       * [font post script name]
       * the post script name is a unique identifier for a font face scoped by the family.
       * this value is parsed from the ttf file itself.
       *
       * @note some fonts, like Inter, do not have a postscript name for instances.
       */
      font_postscript_name?: string | null;
      // #endregion semantics
    }

    /**
     * Text Style
     *
     * a set of properties that can be either applied to a text or textspan
     */
    export interface ITextStyle extends IFontStyle {
      // #region decorations
      text_decoration_line: cg.TextDecorationLine;
      text_decoration_style?: cg.TextDecorationStyle | null;
      text_decoration_color?: cg.TextDecorationColorValue | null;
      text_decoration_skip_ink?: cg.TextDecorationSkipInkFlag | null;
      text_decoration_thickness?: cg.TextDecorationThicknessPercentage | null;
      // #endregion decorations

      text_transform?: cg.TextTransform;

      /**
       * letter-spacing in em (percentage) value
       *
       * @example 1 = 100% / 1em
       * @default 0
       */
      letter_spacing?: number;

      /**
       * word-spacing in em (percentage) value
       *
       * @example 1 = 100% / 1em
       * @default 0
       */
      word_spacing?: number;

      /**
       * line-height in percentage value only. 0% ~
       * @example undefined = "normal"
       * @example 1 = 100% / 1em
       * @min 0
       */
      line_height?: number;
    }

    /**
     * Text Node Style
     *
     * a set of properties that can be applied to a text node, but not to a textspan
     */
    export interface ITextNodeStyle
      extends ITextStyle,
        IFill<props.PropsPaintValue> {
      /**
       * @default "left"
       */
      text_align: cg.TextAlign;
      /**
       * @default "top"
       */
      text_align_vertical: cg.TextAlignVertical;
    }

    export interface IComputedTextNodeStyle
      extends __ReplaceSubset<
        ITextNodeStyle,
        IFill<props.PropsPaintValue>,
        { fill: cg.Paint }
      > {}

    export interface ITextValue {
      text: props.PropsTextValue | null;

      /**
       * set max length of the text value
       * - Note: max length is ignored when set programmatically
       * - Note: this is a experimental feature and its behaviour is not strictly defined
       * @see https://json-schema.org/understanding-json-schema/reference/string#length
       *
       * @deprecated - not standard
       */
      max_length?: number;
    }

    export interface IComputedTextValue {
      text: string | null;
    }

    export interface ISourceValue {
      /**
       * **[video / image]**
       * required - when falsy, the image will not be rendered
       * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/src
       *
       * ---
       *
       * **[iframe]**
       * The URL of the page to embed.
       *
       * Note: as we don't support `srcdoc` attribute, the content should be a url to a valid html page.
       *
       * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#src
       */

      src?: tokens.StringValueExpression;
    }

    export interface IHTMLRichTextValue {
      html: props.PropsTextValue | null;
    }

    export interface IProperties {
      properties: Record<string, schema.PropertyDefinition>;
    }

    export interface IProps {
      /**
       * props data
       *
       * expression that will be passed to this instance
       *
       * it should match the signature with defined properties
       */
      props: Record<string, schema.Value>;
    }
  }

  type __ReplaceSubset<T, TSubset extends Partial<T>, TNew> = Omit<
    T,
    keyof TSubset
  > &
    TNew;

  // type ConnectorPoint = {
  //   type: "position";
  //   x: number;
  //   y: number;
  // };

  // export interface ConnectorNode {
  //   readonly type: "connector";
  //   a: ConnectorPoint;
  //   b: ConnectorPoint;
  // }

  /**
   * Scene Node
   *
   * [SceneNode] represents a top-level scene (formerly known as Page).
   * Scenes are always root-level nodes and cannot be nested under other nodes.
   * They can contain multiple children based on their constraints.
   */
  export interface SceneNode
    extends i.IBaseNode,
      i.ISceneNode,
      document.ISceneBackground,
      document.I2DGuides,
      document.IEdges {
    readonly type: "scene";
    constraints: {
      children: "single" | "multiple";
    };
    order?: number;
  }

  /**
   * Group Node
   *
   * [GroupNode] is not supported in the html/svg backend.
   */
  export interface GroupNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IBlend,
      i.IExpandable,
      i.IPositioning {
    type: "group";
    //
  }

  /**
   * Boolean Path Operation Node
   *
   * [BooleanPathOperationNode] is not supported in the html/svg backend.
   */
  export interface BooleanPathOperationNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IBlend,
      i.IExpandable,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke,
      i.IPositioning {
    type: "boolean";
    op: cg.BooleanOperation;
  }

  export interface TextNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IEffects,
      i.IHrefable,
      i.IMouseCursor,
      i.ITextNodeStyle,
      i.ITextValue,
      i.ITextStroke {
    readonly type: "text";

    max_lines?: number | null;
    // textAutoResize: "none" | "width" | "height" | "auto";
  }

  export interface ComputedTextNode
    extends __ReplaceSubset<
      TextNode,
      i.ITextValue & i.ITextStyle,
      i.IComputedTextValue & i.IComputedTextNodeStyle
    > {
    readonly type: "text";
    max_lines?: number | null;
  }

  export interface ImageNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IEffects,
      i.IBoxFit,
      i.IHrefable,
      i.IMouseCursor,
      i.ICornerRadius,
      i.IRectangularCornerRadius,
      i.IRectangularStrokeWidth,
      i.ISourceValue {
    readonly type: "image";
    alt?: string;
  }

  export interface ComputedImageNode
    extends __ReplaceSubset<ImageNode, i.ISourceValue, { src: string }> {
    readonly type: "image";
  }

  /**
   * [HTMLRichText]
   *
   * Note:
   * - Limited to HTML environment
   * - {@link TextNode} also supports rich styling, but only limited to text spans.
   *
   * RichText can hold any html-like text content, including text spans, links, images, etc.
   */
  export interface HTMLRichTextNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IHrefable,
      i.IMouseCursor,
      i.IHTMLRichTextValue {
    readonly type: "richtext";
  }

  export interface ComputedHTMLRichTextNode
    extends __ReplaceSubset<
      HTMLRichTextNode,
      i.IHTMLRichTextValue,
      { html: string }
    > {
    readonly type: "richtext";
  }

  export interface VideoNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IBoxFit,
      i.IHrefable,
      i.IMouseCursor,
      i.ICornerRadius,
      i.IRectangularCornerRadius,
      i.IRectangularStrokeWidth,
      i.ISourceValue {
    readonly type: "video";

    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video#poster
     */
    poster?: tokens.StringValueExpression;
    loop: boolean;
    muted: boolean;
    autoplay: boolean;
  }

  export interface ComputedVideoNode
    extends __ReplaceSubset<VideoNode, i.ISourceValue, { src: string }> {
    readonly type: "video";
  }

  export interface ContainerNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IEffects,
      i.IHrefable,
      i.IMouseCursor,
      i.IExpandable,
      i.ICornerRadius,
      i.IRectangularCornerRadius,
      i.IRectangularStrokeWidth,
      i.IPadding,
      i.IFlexContainer {
    readonly type: "container";
    //
  }

  export interface ComputedContainerNode
    extends __ReplaceSubset<ContainerNode, {}, {}> {
    readonly type: "container";
    //
  }

  /**
   * <iframe> Node.
   *
   * The use and rendering of iframe node is limited by the environment.
   */
  export interface HTMLIFrameNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.ICornerRadius,
      i.IRectangularCornerRadius,
      i.ISourceValue {
    readonly type: "iframe";
  }

  export interface ComputedHTMLIFrameNode
    extends __ReplaceSubset<HTMLIFrameNode, i.ISourceValue, { src: string }> {
    readonly type: "iframe";
  }

  /**
   * [Bitmap Node]
   *
   * Bitmap node is a node that can have a bitmap data as a grid.
   *
   * This is used non-performance intensive graphics, e.g. for 255x255 pixel art.
   *
   * For loading png, jpg, etc. images, use {@link ImageNode} instead.
   *
   * The bitmap data can by found in {@link document.IBitmapsRepository} images[this.id].data
   */
  export interface BitmapNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IPositioning,
      i.IFixedDimension,
      i.IBlend,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint> {
    readonly type: "bitmap";
    readonly imageRef: string;
  }

  export type ComputedBitmapNode = BitmapNode;

  /**
   * @deprecated - not ready - do not use in production
   */
  export interface SVGPathNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      // i.ICSSDimension,
      i.IFixedDimension,
      i.IBlend,
      i.ILayerMaskType,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint> {
    type: "svgpath";

    /**
     * @deprecated - use vectorNetwork instead
     */
    paths: (cg.Path & {
      /**
       * specifies which property to use to fill the path
       * this is to support compatibility with figma rest api, where it returns a vector stroke as a path individually
       *
       * @default "fill"
       */
      fill: "fill" | "stroke";
    })[];
  }

  /**
   * @deprecated - not ready - do not use in production
   */
  export type ComputedSVGPathNode = SVGPathNode;

  export interface RegularPolygonNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IFixedDimension,
      i.IBlend,
      i.ILayerMaskType,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke {
    readonly type: "polygon";
    point_count: number;
  }

  export interface RegularStarPolygonNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IFixedDimension,
      i.IBlend,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke {
    readonly type: "star";
    point_count: number;
    inner_radius: number;
  }

  export interface VectorNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IFixedDimension,
      i.IBlend,
      i.IZIndex,
      i.IRotation,
      i.ICornerRadius,
      i.IFill<cg.Paint>,
      i.IStroke {
    readonly type: "vector";

    /**
     * @deprecated
     * @default "nonzero"
     */
    fillRule?: cg.FillRule;

    vector_network: vn.VectorNetwork;
  }

  export interface ComputedVectorNode
    extends __ReplaceSubset<VectorNode, i.IFill<cg.Paint>, i.IFill<cg.Paint>> {
    readonly type: "vector";
  }

  /**
   * Line Node
   *
   * Note: this does not represent a polyline or a path, it only represents a straight line with two points.
   *
   * - [Env:HTML/SVG] on svg rendering, this will be rendered as `<line>` with `x1`, `y1`, `x2`, `y2` attributes.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Element/line}
   * @see {@link https://api.skia.org/classSkSVGLine.html}
   * @see {@link https://www.figma.com/plugin-docs/api/LineNode/}
   * @see {@link https://konvajs.org/api/Konva.Line.html}
   *
   */
  export interface LineNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IStroke,
      i.IFixedDimension,
      i.IBlend,
      i.ILayerMaskType,
      i.IZIndex,
      i.IRotation {
    readonly type: "line";
    height: 0;
  }

  export interface ComputedLineNode extends LineNode {
    readonly type: "line";
  }

  /**
   * Rect Node
   *
   * - [Env:HTML/SVG] on svg rendering, this will be rendered as `<rect>` with `x`, `y`, `width`, `height` attributes with unified corner radius.
   * - [Env:HTML/SVG] on svg rendering, this will be rendered as `<path>` with `d` attribute with individual rounded corner path.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Element/rect}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Element/path}
   * @see {@link https://api.skia.org/classSkRRect.html}
   * @see {@link https://www.figma.com/plugin-docs/api/RectangleNode/}
   *
   */
  export interface RectangleNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      // i.ICSSDimension,
      i.IFixedDimension,
      i.IBlend,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke,
      i.IRectangularStrokeWidth,
      i.IEffects,
      i.ICornerRadius,
      i.IRectangularCornerRadius {
    readonly type: "rectangle";
  }

  /**
   * {@link RectangleNode} with computed properties
   */
  export interface ComputedRectangleNode
    extends __ReplaceSubset<
      RectangleNode,
      i.IFill<cg.Paint>,
      i.IFill<cg.Paint>
    > {
    readonly type: "rectangle";
  }

  /**
   * Ellipse Node
   *
   * - For Drawing Arc, use ArcNode
   * - [Env:SVG] on svg rendering, this will be rendered as `<ellipse>` with `cx`, `cy`, `rx`, `ry` attributes calculated from the `width`, `height` and `x`, `y` properties.
   */
  export interface EllipseNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      // i.ICSSDimension,
      i.IFixedDimension,
      i.IEllipseArcData,
      i.IBlend,
      i.ILayerMaskType,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke,
      i.IEffects {
    type: "ellipse";
  }

  /**
   * {@link EllipseNode} with computed properties
   */
  export interface ComputedEllipseNode
    extends __ReplaceSubset<EllipseNode, i.IFill<cg.Paint>, i.IFill<cg.Paint>> {
    readonly type: "ellipse";
  }

  //
  export interface ComponentNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IHrefable,
      i.IMouseCursor,
      i.IExpandable,
      i.ICornerRadius,
      i.IRectangularCornerRadius,
      i.IPadding,
      i.IFlexContainer,
      i.IProperties {
    readonly type: "component";
  }

  export type ComputedComponentNode = ComponentNode;

  export interface InstanceNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IBlend,
      i.IPositioning,
      // i.ICSSStylable,
      i.IHrefable,
      i.IMouseCursor,
      i.IProperties,
      i.IProps {
    readonly type: "instance";
    /**
     * ID of component that this instance came from, refers to components table
     */
    component_id: NodeID;
  }

  export type ComputedInstanceNode = InstanceNode;

  /**
   * [Template Instance Node] Template node is a static, hand crafted template that does not have a intrinsic tree, only a root properties [data] and [overrides] to each customizable node
   *
   * Limitations ATM:
   * - Template Node cannot be used as a child node.
   * - There can be only one, root template node in a document.
   *
   * This is useful when you have a complex structure with custom loggics and state management, use this node and expose only customizable nodes and properties.
   */
  export interface TemplateInstanceNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.ICSSDimension,
      i.IProperties,
      i.IProps,
      // TODO: migration required - remove me - use global override table instead
      document.IOverridesRepository {
    readonly type: "template_instance";

    /**
     * ID of template definition that this instance came from, refers to user defined templates table
     */
    template_id: string;
  }

  export type ComputedTemplateInstanceNode = TemplateInstanceNode;

  export namespace factory {
    /**
     * calling this does not actually contribute to the rendering by itself, it creates a {@link TemplateInstanceNode} data.
     */
    export function createTemplateInstanceNodeDataFromTemplateDefinition(
      id: string,
      def: document.template.TemplateDocumentDefinition,
      seed?: Partial<Omit<TemplateInstanceNode, "id">>
    ): TemplateInstanceNode {
      const { nodes, properties } = def;

      return {
        id,
        name: def.name,
        type: "template_instance",
        active: true,
        locked: false,
        position: "relative",
        properties,
        props: {},
        userdata: {},
        overrides: cloneWithUndefinedValues(nodes),
        template_id: def.name,
        width: "auto",
        height: "auto",
        ...seed,
      };
      //
    }

    /**
     * Creates a Node data from prototype input, while ignoring the prototype's children.
     *
     * It still follows the node structure and returns with empty array `{ children: [] }` if the node requires children property.
     *
     * calling this does not actually contribute to the rendering by itself, it creates a {@link Node} data.
     *
     * @param prototype partial node prototype to start with
     * @param nid nid generator
     * @returns
     */
    export function createNodeDataFromPrototypeWithoutChildren(
      prototype: Partial<NodePrototype>,
      id: NodeID
    ): Node {
      switch (prototype.type) {
        case "rectangle": {
          return {
            name: "rectangle",
            type: "rectangle",
            active: true,
            locked: false,
            opacity: 1,
            blend_mode: cg.def.LAYER_BLENDMODE,
            z_index: 0,
            rotation: 0,
            width: 0,
            height: 0,
            position: "absolute",
            top: 0,
            left: 0,
            corner_radius: 0,
            corner_radius_top_left: 0,
            corner_radius_top_right: 0,
            corner_radius_bottom_left: 0,
            corner_radius_bottom_right: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            ...prototype,
            id: id,
          } satisfies RectangleNode;
        }
        // TODO:
        case "boolean":
        case "group":
        case "container":
        case "component":
        case "instance":
        case "template_instance": {
          // Remove children from prototype before spreading to prevent leakage
          const { children, ...prototypeWithoutChildren } = prototype as any;
          // @ts-expect-error
          return {
            name: prototype.type,
            type: prototype.type,
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            rotation: 0,
            ...prototypeWithoutChildren,
            id: id,
          } as UnknwonNode;
        }
        // TODO:
        case "bitmap":
        case "ellipse":
        case "iframe":
        case "image":
        case "line":
        case "richtext":
        case "text":
        case "vector":
        case "svgpath":
        case "polygon":
        case "star":
        case "video": {
          // @ts-expect-error
          return {
            name: prototype.type,
            type: prototype.type,
            active: true,
            locked: false,
            opacity: 1,
            z_index: 0,
            rotation: 0,
            width: 100,
            height: 100,
            position: "absolute",
            ...prototype,
            id: id,
          } as UnknwonNode;
        }
        default:
          throw new Error(
            `Unsupported node prototype type: ${(prototype as any).type}`
          );
      }
    }

    type FactoryNodeIdGenerator<D> = (data: D, depth: number) => NodeID;

    /**
     * Creates a sub document {@link document.IPackedSceneDocument} from a prototype input.
     *
     * When injecting this to the master document, simply merge this to the master document, and add the root as a children of certain node.
     */
    export function create_packed_scene_document_from_prototype<
      D extends Partial<NodePrototype>,
    >(
      prototype: D,
      nid: FactoryNodeIdGenerator<D | Partial<NodePrototype>>
    ): document.IPackedSceneDocument {
      const document: document.IPackedSceneDocument = {
        bitmaps: {},
        images: {},
        nodes: {},
        links: {},
        scene: {
          type: "scene",
          id: "tmp",
          name: "tmp",
          children_refs: [],
          guides: [],
          edges: [],
          constraints: {
            children: "multiple",
          },
        },
        properties: {},
      };

      function processNode(
        prototype: D | Partial<NodePrototype>,
        nid: FactoryNodeIdGenerator<D | Partial<NodePrototype>>,
        depth: number = 0
      ): nodes.Node {
        const id = prototype._$id || nid(prototype, depth);
        const node = createNodeDataFromPrototypeWithoutChildren(prototype, id);
        document.nodes[node.id] = node;

        // Process children and populate links (not node properties)
        if (nodes.hasChildren(prototype)) {
          const childIds: nodes.NodeID[] = [];
          for (const childPrototype of prototype.children) {
            const childNode = processNode(childPrototype, nid, depth + 1);
            childIds.push(childNode.id);
          }
          // Populate document.links instead of node.children
          document.links[node.id] = childIds;
        }

        return node;
      }

      const rootNode = processNode(prototype, nid);
      document.scene.children_refs = [rootNode.id];

      return document;
    }

    export function packed_scene_document_to_full_document(
      packed: document.IPackedSceneDocument
    ): document.Document {
      const { scene, ...defs } = packed;

      // Create SceneNode from Scene
      const sceneNode: nodes.SceneNode = {
        type: "scene",
        id: scene.id,
        name: scene.name,
        active: true,
        locked: false,
        constraints: scene.constraints,
        order: scene.order,
        guides: scene.guides,
        edges: scene.edges,
        background_color: scene.background_color,
      };

      // Add scene to nodes if not present
      if (!defs.nodes[scene.id]) {
        defs.nodes[scene.id] = sceneNode;
      }

      // Add scene children to links if not present
      if (!defs.links[scene.id]) {
        defs.links[scene.id] = scene.children_refs;
      }

      return {
        ...defs,
        scenes_ref: [scene.id],
      };
    }

    /**
     * @param snapshot entire or partial document snapshot - this must include the target and its children, otherwise it will throw.
     * @param id target node id
     */
    export function createPrototypeFromSnapshot(
      snapshot: document.IDocumentDefinition,
      id: nodes.NodeID
    ): nodes.NodePrototype {
      // Ensure the node exists in the snapshot
      const node = snapshot.nodes[id];
      if (!node) {
        throw new Error(`Node with ID "${id}" not found in the snapshot.`);
      }

      // Create a shallow copy of the node, excluding the `id` field
      const prototype: Partial<nodes.NodePrototype> = JSON.parse(
        JSON.stringify(node)
      );
      // @ts-expect-error
      delete prototype.id;
      // remove internal ids to ensure new insertions generate fresh ids
      // @ts-expect-error
      delete prototype._$id;

      // Handle children recursively, if the node has children
      const children_refs = snapshot.links[id];
      if (Array.isArray(children_refs)) {
        (prototype as __IPrototypeNodeChildren).children = children_refs.map(
          (childId) => createPrototypeFromSnapshot(snapshot, childId)
        );
      }

      return prototype as nodes.NodePrototype;
    }

    export function createContainerNode(
      id: string,
      partial: Partial<ContainerNode> = {}
    ): ContainerNode {
      return {
        type: "container",
        id: id,
        name: "container",
        active: true,
        locked: false,
        expanded: false,
        rotation: 0,
        z_index: 0,
        opacity: 1,
        blend_mode: cg.def.LAYER_BLENDMODE,
        position: "absolute",
        layout: "flow",
        direction: "horizontal",
        main_axis_alignment: "start",
        main_axis_gap: 0,
        cross_axis_alignment: "start",
        cross_axis_gap: 0,
        padding: 0,
        width: 100,
        height: 100,
        corner_radius: 0,
        corner_radius_top_left: 0,
        corner_radius_top_right: 0,
        corner_radius_bottom_left: 0,
        corner_radius_bottom_right: 0,
        style: {},
        // children_refs: [],
        ...partial,
      };
    }
  }
}

const cloneWithUndefinedValues = (
  obj: Record<string, any>
): Record<string, undefined> =>
  Object.fromEntries(Object.keys(obj).map((key) => [key, undefined])) as Record<
    string,
    undefined
  >;
