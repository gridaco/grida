import type { tokens } from "@grida/tokens";
import type { TokenizableExcept } from "@grida/tokens/utils";
import type vn from "@grida/vn";
import type cg from "@grida/cg";
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
        rgba: RGBA;
      };

      export type Object = Richtext | RGBA | Source | VideoPlayerSource;

      export type Richtext = {
        type: "richtext";
        html: string;
      };

      export type RGBA = {
        type: "rgba";
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
  export const SCHEMA_VERSION = "0.0.1-beta.1+20250728";

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
  export interface INodesRepository {
    nodes: Record<nodes.NodeID, nodes.Node>;
  }

  /**
   * reference to an registered image
   */
  export type ImageRef = {
    type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
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
    backgroundColor?: cg.RGBA8888 | null | undefined | "";
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
      document.INodesRepository,
      IDocumentProperties {
    // scene: Scene;
  }

  /**
   * [Grida Document Model]
   *
   * Grida document contains all nodes, properties, and embedded data required to render a complete document.
   */
  export interface Document extends IDocumentDefinition {
    scenes: Record<string, Scene>;
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
    children: nodes.NodeID[];
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
      children: [],
      ...init,
    } as grida.program.document.Scene;
  }

  export namespace internal {
    /**
     * @internal
     * Represents the current runtime state of the document hierarchy context.
     *
     * This interface is designed for **in-memory, runtime-only** use and should not be used for persisting data.
     * It exists to provide efficient access to the parent and child relationships within the document tree without
     * modifying the core node structure directly.
     *
     * ## Why We Use This Interface
     * This interface allows for a structured, performant way to manage node hierarchy relationships without introducing
     * a `parent_id` property on each `Node`. By using an in-memory context, we avoid potential issues with nullable `parent_id` fields,
     * which could lead to unpredictable coding experiences. Additionally, maintaining these relationships within a dedicated
     * context layer promotes separation of concerns, keeping core node definitions stable and interface-compatible.
     *
     * ## Functionality
     * - **Get Parent Node by Child ID**: Efficiently map a node's ID (`NodeID`) to its parent node ID.
     * - **Get Child Nodes by Parent ID**: Access a list of child node IDs for any given parent node.
     *
     * ## Management Notes
     * - This interface should be populated and managed only during runtime.
     * - It is recommended to initialize `ctx_nid_to_parent_id` and `ctx_nid_to_children_ids` during document tree loading or
     *   initial rendering.
     * - If the node hierarchy is updated (e.g., nodes are added or removed), this context should be refreshed to reflect the
     *   current relationships.
     *
     */
    export interface INodesRepositoryRuntimeHierarchyContext {
      /**
       * Array (Set) of all node IDs in the document, facilitating traversal and lookup.
       */
      readonly __ctx_nids: Array<nodes.NodeID>;

      /**
       * Maps each node ID to its respective parent node ID, facilitating upward traversal.
       */
      readonly __ctx_nid_to_parent_id: Record<
        nodes.NodeID,
        nodes.NodeID | null
      >;

      /**
       * Maps each node ID to an array of its child node IDs, enabling efficient downward traversal.
       *
       * This does NOT ensure the order of the children. when to reorder, use the `children` property in the node.
       */
      readonly __ctx_nid_to_children_ids: Record<nodes.NodeID, nodes.NodeID[]>;
    }
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
    > extends INodesRepository {
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
    borderColor: cg.RGBA8888;
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
      | "flexWrap"
      //
    >
  >;
}

export namespace grida.program.nodes {
  export type NodeID = string;
  export type NodeType = Node["type"];

  export type Node =
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

    export interface IOpacity {
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
    }

    export interface IBlendMode {
      /**
       * @default "normal"
       */
      blendMode?: cg.BlendMode;
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
      zIndex: number;
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
      cornerRadius?: number;
    }

    /**
     * Rectangle Corner
     */
    export interface IRectangularCornerRadius {
      cornerRadiusTopLeft?: number;
      cornerRadiusTopRight?: number;
      cornerRadiusBottomLeft?: number;
      cornerRadiusBottomRight?: number;
    }

    /**
     * padding
     */
    export interface IPadding {
      padding:
        | number
        | {
            paddingTop: number;
            paddingRight: number;
            paddingBottom: number;
            paddingLeft: number;
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
       * the flex model main axis alignment - takes effect when layout is set to `flex`
       *
       * @default "start"
       */
      mainAxisAlignment: cg.MainAxisAlignment;

      /**
       *
       * the flex model cross axis alignment - takes effect when layout is set to `flex`
       *
       * @default "start"
       */
      crossAxisAlignment: cg.CrossAxisAlignment;

      /**
       * the gap between the children in main axis - takes effect when layout is set to `flex`
       *
       * commonly refered as `row-gap` (in row direction) or `column-gap` (in column direction)
       *
       * @default 0
       */
      mainAxisGap: number;

      /**
       * the gap between the children in cross axis - takes effect when layout is set to `flex`
       *
       * commonly refered as `column-gap` (in row direction) or `row-gap` (in column direction)
       *
       * @default 0
       */
      crossAxisGap: number;
    }

    /**
     * Node wih Box Fit `fit`, a.k.a. `object-fit`
     */
    export interface IBoxFit {
      fit: cg.BoxFit;
    }

    export interface IChildrenReference {
      children: NodeID[];
    }

    /**
     * Node that can be filled with color - such as rectangle, ellipse, etc.
     */
    export interface IFill<T> {
      // FIXME: make it nullable
      fill?: T | undefined;
    }

    export interface IEffects {
      feBlur?: cg.FeBlur;
      feBackdropBlur?: cg.FeBlur;
      feShadows?: cg.FeShadow[];
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
      angleOffset: number;

      /**
       * inner radius in 0~1
       * @default 0
       */
      innerRadius: number;
    }

    /**
     * Node that supports stroke with color - such as rectangle, ellipse, etc.
     */
    export interface IStroke {
      stroke?: cg.Paint;

      /**
       * stroke width - 0 or greater
       */
      strokeWidth: number;

      /**
       * variable width stroke width profile
       */
      strokeWidthProfile?: cg.VariableWidthProfile;

      /**
       * stroke alignment - takes effect when stroke is set
       */
      strokeAlign?: cg.StrokeAlign;

      /**
       * @default "butt"
       */
      strokeCap: cg.StrokeCap;
    }

    /**
     * - [Env:HTML] for html text, `-webkit-text-stroke` will be used
     */
    export interface ITextStroke {
      stroke?: cg.Paint;
      /**
       * stroke width - 0 or greater
       */
      strokeWidth?: number;
      /**
       * stroke alignment - takes effect when stroke is set
       */
      strokeAlign?: cg.StrokeAlign;
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
        IOpacity,
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
     * Text Style
     *
     * a set of properties that can be either applied to a text or textspan
     */
    export interface ITextStyle {
      fontFamily?: string;
      fontSize: number;
      fontWeight: cg.NFontWeight | number;
      fontOpticalSizing?: cg.OpticalSizing;

      /**
       * OpenType features
       * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings
       */
      fontFeatures?: Partial<Record<cg.OpenTypeFeature, boolean>>;
      /**
       * custom font variations
       * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings
       */
      fontVariations?: Record<string, number>;

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
      fontStyleItalic?: boolean;
      /**
       * [font post script name]
       * the post script name is a unique identifier for a font face scoped by the family.
       * this value is parsed from the ttf file itself.
       */
      fontPostscriptName?: string;
      // #endregion semantics

      // #region decorations
      textDecorationLine: cg.TextDecorationLine;
      textDecorationStyle?: cg.TextDecorationStyle | null;
      textDecorationColor?: cg.TextDecorationColorValue | null;
      textDecorationSkipInk?: cg.TextDecorationSkipInkFlag | null;
      textDecorationThickness?: cg.TextDecorationThicknessPercentage | null;
      // #endregion decorations

      textTransform?: cg.TextTransform;

      /**
       * letter-spacing in em (percentage) value
       *
       * @example 1 = 100% / 1em
       * @default 0
       */
      letterSpacing?: number;

      /**
       * word-spacing in em (percentage) value
       *
       * @example 1 = 100% / 1em
       * @default 0
       */
      wordSpacing?: number;

      /**
       * line-height in percentage value only. 0% ~
       * @example undefined = "normal"
       * @example 1 = 100% / 1em
       * @min 0
       */
      lineHeight?: number;
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
      textAlign: cg.TextAlign;
      /**
       * @default "top"
       */
      textAlignVertical: cg.TextAlignVertical;
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
      maxLength?: number;
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
   * Group Node
   *
   * [GroupNode] is not supported in the html/svg backend.
   */
  export interface GroupNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IChildrenReference,
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
      i.IChildrenReference,
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

    maxLines?: number | null;
    // textAutoResize: "none" | "width" | "height" | "auto";
  }

  export interface ComputedTextNode
    extends __ReplaceSubset<
      TextNode,
      i.ITextValue & i.ITextStyle,
      i.IComputedTextValue & i.IComputedTextNodeStyle
    > {
    readonly type: "text";
    maxLines?: number | null;
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
      i.IChildrenReference,
      i.ICornerRadius,
      i.IRectangularCornerRadius,
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
      i.IOpacity,
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
      i.IOpacity,
      i.IBlendMode,
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
      i.IOpacity,
      i.IBlendMode,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke {
    readonly type: "polygon";
    pointCount: number;
  }

  export interface RegularStarPolygonNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IFixedDimension,
      i.IOpacity,
      i.IBlendMode,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke {
    readonly type: "star";
    pointCount: number;
    innerRadius: number;
  }

  export interface VectorNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IFixedDimension,
      i.IOpacity,
      i.IBlendMode,
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

    vectorNetwork: vn.VectorNetwork;
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
      i.IOpacity,
      i.IBlendMode,
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
      i.IOpacity,
      i.IBlendMode,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke,
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
      i.IOpacity,
      i.IBlendMode,
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
      i.IChildrenReference,
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
      i.IHrefable,
      i.IMouseCursor,
      i.ISceneNode,
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
            blendMode: "normal",
            zIndex: 0,
            rotation: 0,
            width: 0,
            height: 0,
            position: "absolute",
            top: 0,
            left: 0,
            cornerRadius: 0,
            cornerRadiusTopLeft: 0,
            cornerRadiusTopRight: 0,
            cornerRadiusBottomLeft: 0,
            cornerRadiusBottomRight: 0,
            strokeWidth: 0,
            strokeCap: "butt",
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
          // @ts-expect-error
          return {
            name: prototype.type,
            type: prototype.type,
            active: true,
            locked: false,
            opacity: 1,
            zIndex: 0,
            rotation: 0,
            children: [],
            ...prototype,
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
            zIndex: 0,
            rotation: 0,
            width: 100,
            height: 100,
            position: "absolute",
            ...prototype,
            id: id,
          } as UnknwonNode;
        }
        default:
          throw new Error(`Unsupported node prototype type: ${prototype.type}`);
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
        scene: {
          type: "scene",
          id: "tmp",
          name: "tmp",
          children: [],
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

        if ("children" in prototype) {
          const node_with_children = node as nodes.i.IChildrenReference;
          node_with_children.children = [];
          for (const childPrototype of prototype.children ?? []) {
            const childNode = processNode(childPrototype, nid, depth + 1);
            node_with_children.children.push(childNode.id);
          }
        }

        return node;
      }

      const rootNode = processNode(prototype, nid);
      document.scene.children = [rootNode.id];

      return document;
    }

    export function packed_scene_document_to_full_document(
      packed: document.IPackedSceneDocument
    ): document.Document {
      const { scene, ...defs } = packed;
      return {
        ...defs,
        scenes: {
          [scene.id]: scene,
        },
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
      if ("children" in node && Array.isArray(node.children)) {
        (prototype as __IPrototypeNodeChildren).children = node.children.map(
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
        zIndex: 0,
        opacity: 1,
        position: "absolute",
        layout: "flow",
        direction: "horizontal",
        mainAxisAlignment: "start",
        mainAxisGap: 0,
        crossAxisAlignment: "start",
        crossAxisGap: 0,
        padding: 0,
        width: 100,
        height: 100,
        cornerRadius: 0,
        cornerRadiusTopLeft: 0,
        cornerRadiusTopRight: 0,
        cornerRadiusBottomLeft: 0,
        cornerRadiusBottomRight: 0,
        style: {},
        children: [],
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
