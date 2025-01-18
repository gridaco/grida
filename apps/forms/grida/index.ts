import type { tokens } from "@grida/tokens";
import type { vn } from "./vn";

// TODO: remove this dependency
import type { DocumentDispatcher } from "@/grida-react-canvas";
import { cmath } from "@grida/cmath";

export namespace grida {
  export const mixed: unique symbol = Symbol();

  export namespace io {
    /**
     * Grida Document File model
     * .grida file is a JSON file that contains the document structure and metadata.
     */
    export interface DocumentFileModel {
      doctype: "v0_document";
      document: grida.program.document.IDocumentDefinition;
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
        default?:
          | tokens.StringValueExpression
          | tokens.NumericValueExpression
          | tokens.BooleanValueExpression;
        required?: boolean;
        //
      }

      interface TypeArrayPropertyDefinition<T extends Array<Value>> {
        type: "array";
        items: PropertyDefinition;
        default?: T;
        required?: boolean;
        //
      }

      interface TypeObjectPropertyDefinition<T extends Record<string, Value>> {
        type: "object";
        properties: Record<string, PropertyDefinition>;
        default?: T;
        required?: boolean;
        //
      }

      interface TypeWellKnownObjectPropertyDefinition {
        type: objects.ObjectType;
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
  /**
   * Simple Node Selector
   *
   * - "*" - all nodes
   * - "~" - siblings of current selection
   *    - does not include the current selection
   *    - if multiple selection, this is only valid if all selected nodes are siblings
   * - ">" - children of current selection
   * - "selection" - current selection
   * - [] - specific nodes
   *
   * @example
   * - Select all nodes: "*"
   * - Select siblings of current selection: "~"
   * - Select self and siblings: ["selection", "~"]
   * - Select children of current selection: ">"
   */
  export type Selector = "*" | "~" | ">" | ".." | "selection" | nodes.NodeID[];

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
   * contains all nodes under this defined document in k:v pair
   *
   * @see {@link IDocumentDefinition}
   */
  export interface IDocumentNodesRepository {
    nodes: Record<nodes.NodeID, nodes.Node>;
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
   * background color of the document
   */
  export interface IDocumentBackground {
    /**
     * This property may not be handled, or fallback to white #FFFFFF depending on the rendering context.
     */
    backgroundColor?: cg.RGBA8888 | null | undefined | "";
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

  export interface IDocumentOverridesRepository {
    /**
     * instance's exposed child node overrides
     */
    overrides: Record<nodes.NodeID, nodes.NodeChange>;
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
    extends IDocumentNodesRepository,
      IDocumentProperties,
      IDocumentBackground {
    /**
     * root node id. must be defined in {@link IDocumentDefinition.nodes}
     */
    root_id: string;
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
    export interface IDocumentDefinitionRuntimeHierarchyContext {
      /**
       * Array (Set) of all node IDs in the document, facilitating traversal and lookup.
       */
      readonly __ctx_nids: Array<nodes.NodeID>;

      /**
       * Maps each node ID to its respective parent node ID, facilitating upward traversal.
       */
      readonly __ctx_nid_to_parent_id: Record<nodes.NodeID, nodes.NodeID>;

      /**
       * Maps each node ID to an array of its child node IDs, enabling efficient downward traversal.
       *
       * This does NOT ensure the order of the children. when to reorder, use the `children` property in the node.
       */
      readonly __ctx_nid_to_children_ids: Record<nodes.NodeID, nodes.NodeID[]>;
    }

    /**
     * Builds the runtime context for document hierarchy, providing mappings for
     * parent-child relationships without modifying core node structure.
     *
     * @param document - The document definition containing all nodes.
     * @returns {grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext} The hierarchy context,
     * containing mappings of each node's parent and children.
     */
    export function createDocumentDefinitionRuntimeHierarchyContext(
      document: IDocumentDefinition
    ): IDocumentDefinitionRuntimeHierarchyContext {
      const { nodes } = document;
      const ctx: IDocumentDefinitionRuntimeHierarchyContext = {
        __ctx_nids: Object.keys(nodes),
        __ctx_nid_to_parent_id: {},
        __ctx_nid_to_children_ids: {},
      };

      for (const node_id in nodes) {
        const node = nodes[node_id];

        // Ensure the parent has an array in __ctx_nid_to_children_ids
        ctx.__ctx_nid_to_children_ids[node_id] =
          ctx.__ctx_nid_to_children_ids[node_id] ?? [];

        // If the node has children, map each child to its parent and add to the parent’s child array
        if (Array.isArray((node as nodes.UnknwonNode).children)) {
          for (const child_id of (node as nodes.i.IChildrenReference)
            .children) {
            ctx.__ctx_nid_to_parent_id[child_id] = node_id;
            ctx.__ctx_nid_to_children_ids[node_id].push(child_id);
          }
        }
      }

      return ctx;
    }
  }

  export interface INodeHtmlDocumentQueryDataAttributes {
    id: nodes.Node["id"];
    [k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY]: nodes.Node["id"];
    [k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_LOCKED_KEY]: nodes.Node["locked"];
    ["data-grida-node-type"]: nodes.Node["type"];
    // #region dev properties

    /**
     * Dev property - editor-selected
     *
     * if this node is a selected node withing current editor context, when editable
     *
     * this is not required to be set, but once configured to set, it is safe to build apon this attribute
     */
    ["data-dev-editor-selected"]?: boolean | undefined;

    /**
     * Dev property - editor-hovered
     *
     * if this node is a hovered node withing current editor context, when editable
     *
     * this is not required to be set, but once configured to set, it is safe to build apon this attribute
     */
    ["data-dev-editor-hovered"]?: boolean | undefined;
    // #endregion dev properties
  }

  /**
   * wraps node data with document query-able extra data.
   * this is essential when using html backend.
   *
   * grida canvas overlay will use these attributes to determine if the raycasted element is a valid node.
   */
  type INodeWithHtmlDocumentQueryDataAttributes<N extends nodes.Node> =
    INodeHtmlDocumentQueryDataAttributes & N;

  /**
   * final props that matches the react rendering signature
   */
  export type IComputedNodeReactRenderProps<N extends nodes.Node> =
    INodeWithHtmlDocumentQueryDataAttributes<N> & {
      style: React.CSSProperties;
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
    > extends IDocumentNodesRepository {
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
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/blend-mode
   */
  export type BlendMode =
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity";

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
  export type ExplicitlySupportedCSSProperties = Pick<
    // TODO: Drop the React dependency and use css-types instead
    React.CSSProperties,
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
  >;
}
export namespace grida.program.nodes {
  export type NodeID = string;
  export type NodeType = Node["type"];
  export type Node =
    | TextNode
    | ImageNode
    | VideoNode
    | ContainerNode
    | HTMLIFrameNode
    | HTMLRichTextNode
    | VectorNode
    | PathNode
    | LineNode
    | RectangleNode
    | EllipseNode
    | ComponentNode
    | InstanceNode
    | TemplateInstanceNode;

  export type ComputedNode =
    | ComputedTextNode
    | ComputedImageNode
    | ComputedVideoNode
    | ComputedContainerNode
    | ComputedHTMLIFrameNode
    | ComputedHTMLRichTextNode
    | ComputedVectorNode
    | ComputedPathNode
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
      Partial<ComputedVideoNode> &
      Partial<ComputedContainerNode> &
      Partial<ComputedHTMLIFrameNode> &
      Partial<ComputedHTMLRichTextNode> &
      Partial<ComputedVectorNode> &
      Partial<ComputedPathNode> &
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
    Partial<TextNode> &
      Partial<ImageNode> &
      Partial<VideoNode> &
      Partial<ContainerNode> &
      Partial<HTMLIFrameNode> &
      Partial<HTMLRichTextNode> &
      Partial<VectorNode> &
      Partial<PathNode> &
      Partial<LineNode> &
      Partial<RectangleNode> &
      Partial<EllipseNode> &
      Partial<ComponentNode> &
      Partial<InstanceNode> &
      Partial<TemplateInstanceNode>,
    "type"
  > & {
    readonly type: NodeType;
  } & i.IBaseNode &
    i.ISceneNode;

  export type UnknownNodeProperties = Record<keyof UnknwonNode, unknown>;

  /**
   * A virtual, before-instantiation node that only stores the prototype of a node.
   *
   * Main difference between an actual node or node data is, a prototype is only required to have a partial node data, and it has its own hierarchy of children.
   */
  export type NodePrototype =
    | __TPrototypeNode<Omit<Partial<TextNode>, __base_scene_node_properties>>
    | __TPrototypeNode<Omit<Partial<ImageNode>, __base_scene_node_properties>>
    | __TPrototypeNode<Omit<Partial<VideoNode>, __base_scene_node_properties>>
    | __TPrototypeNode<
        Omit<
          Partial<ContainerNode>,
          __base_scene_node_properties | "children"
        > &
          __IPrototypeNodeChildren
      >
    | __TPrototypeNode<
        Omit<Partial<HTMLIFrameNode>, __base_scene_node_properties>
      >
    | __TPrototypeNode<
        Omit<Partial<HTMLRichTextNode>, __base_scene_node_properties>
      >
    | __TPrototypeNode<Omit<Partial<VectorNode>, __base_scene_node_properties>>
    | __TPrototypeNode<Omit<Partial<PathNode>, __base_scene_node_properties>>
    | __TPrototypeNode<Omit<Partial<LineNode>, __base_scene_node_properties>>
    | __TPrototypeNode<
        Omit<Partial<RectangleNode>, __base_scene_node_properties>
      >
    | __TPrototypeNode<Omit<Partial<EllipseNode>, __base_scene_node_properties>>
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
    Partial<i.ISceneNode> &
    T;

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

      export type SolidPaintToken = tokens.utils.TokenizableExcept<
        cg.SolidPaint,
        "type"
      >;

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
     * Rectangle Corner
     */
    export interface IRectangleCorner {
      cornerRadius: number | cg.CornerRadius4;
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
      fill?: T;
    }

    /**
     * Node that supports box-shadow
     */
    export interface IBoxShadow {
      boxShadow?: cg.BoxShadow;
    }

    /**
     * Node that supports stroke with color - such as rectangle, ellipse, etc.
     *
     * - [Env:HTML] for html text, `-webkit-text-stroke` will be used
     *
     */
    export interface IStroke {
      stroke?: cg.Paint;

      /**
       * stroke width - 0 or greater
       */
      strokeWidth: number;

      /**
       * @default "butt"
       */
      strokeCap: cg.StrokeCap;
    }

    export interface ICSSBorder {
      border?: css.Border | undefined;
    }

    export interface IEffects {
      //
      effects: Array<cg.FilterEffects>;
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
        IBoxShadow,
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
      textDecoration: cg.TextDecoration;
      fontFamily?: string;
      fontSize: number;
      fontWeight: cg.NFontWeight;
      /**
       * @default 0
       */
      letterSpacing?: number;
      /**
       * @deprecated
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

  /**
   * @deprecated - not ready - do not use in production
   */
  export interface GroupNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IChildrenReference,
      i.IExpandable {
    //
  }

  export interface TextNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IHrefable,
      i.IMouseCursor,
      i.ITextNodeStyle,
      i.ITextValue {
    readonly type: "text";
    // textAutoResize: "none" | "width" | "height" | "auto";
  }

  export interface ComputedTextNode
    extends __ReplaceSubset<
      TextNode,
      i.ITextValue & i.ITextStyle,
      i.IComputedTextValue & i.IComputedTextNodeStyle
    > {
    readonly type: "text";
  }

  export interface ImageNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.ICSSStylable,
      i.IBoxFit,
      i.IHrefable,
      i.IMouseCursor,
      i.IRectangleCorner,
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
      i.IRectangleCorner,
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
      i.IHrefable,
      i.IMouseCursor,
      i.IExpandable,
      i.IChildrenReference,
      i.IRectangleCorner,
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
      i.IRectangleCorner,
      i.ISourceValue {
    readonly type: "iframe";
  }

  export interface ComputedHTMLIFrameNode
    extends __ReplaceSubset<HTMLIFrameNode, i.ISourceValue, { src: string }> {
    readonly type: "iframe";
  }

  /**
   * @deprecated - not ready - do not use in production
   */
  export interface VectorNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      // i.ICSSDimension,
      i.IFixedDimension,
      i.IOpacity,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint> {
    type: "vector";

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
  export type ComputedVectorNode = VectorNode;

  export interface PathNode
    extends i.IBaseNode,
      i.ISceneNode,
      i.IHrefable,
      i.IMouseCursor,
      i.IPositioning,
      i.IFixedDimension,
      i.IOpacity,
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke {
    readonly type: "path";

    /**
     * @deprecated
     * @default "nonzero"
     */
    fillRule?: cg.FillRule;

    /**
     * @deprecated
     * @todo
     */
    vectorNetwork: vn.VectorNetwork;
  }

  export interface ComputedPathNode
    extends __ReplaceSubset<PathNode, i.IFill<cg.Paint>, i.IFill<cg.Paint>> {
    readonly type: "path";
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
      i.IZIndex,
      i.IRotation,
      i.IFill<cg.Paint>,
      i.IStroke,
      i.IEffects,
      i.IRectangleCorner {
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
      i.IOpacity,
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
      i.IRectangleCorner,
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
      i.IProperties,
      i.IProps,
      // TODO: migration required - remove me - use global override table instead
      document.IDocumentOverridesRepository {
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
        properties,
        props: {},
        userdata: {},
        overrides: cloneWithUndefinedValues(nodes),
        template_id: def.name,
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
            zIndex: 0,
            rotation: 0,
            width: 0,
            height: 0,
            position: "absolute",
            top: 0,
            left: 0,
            cornerRadius: 0,
            strokeWidth: 0,
            strokeCap: "butt",
            effects: [],
            ...prototype,
            id: id,
          } satisfies RectangleNode;
        }
        // TODO:
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
        case "ellipse":
        case "iframe":
        case "image":
        case "line":
        case "path":
        case "richtext":
        case "text":
        case "vector":
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
     * Creates a sub document {@link document.IDocumentDefinition} from a prototype input.
     *
     * When injecting this to the master document, simply merge this to the master document, and add the root as a children of certain node.
     */
    export function createSubDocumentDefinitionFromPrototype<
      D extends Partial<NodePrototype>,
    >(
      prototype: D,
      nid: FactoryNodeIdGenerator<D | Partial<NodePrototype>>
    ): document.IDocumentDefinition {
      const document: document.IDocumentDefinition = {
        root_id: "",
        nodes: {},
        properties: {},
      };

      function processNode(
        prototype: D | Partial<NodePrototype>,
        nid: FactoryNodeIdGenerator<D | Partial<NodePrototype>>,
        depth: number = 0
      ): nodes.Node {
        const id = nid(prototype, depth);
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
      document.root_id = rootNode.id;

      return document;
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

      // Handle children recursively, if the node has children
      if ("children" in node && Array.isArray(node.children)) {
        (prototype as __IPrototypeNodeChildren).children = node.children.map(
          (childId) => createPrototypeFromSnapshot(snapshot, childId)
        );
      }

      return prototype as nodes.NodePrototype;
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

/**
 * Core Graphics
 */
export namespace grida.program.cg {
  export type Vector2 = [number, number];

  /**
   * A 2D Affine Transformation Matrix.
   *
   * This matrix is used to perform linear transformations (e.g., scaling, rotation, shearing)
   * and translations in a two-dimensional coordinate space. It is a compact representation
   * of a transformation that maps points, lines, or shapes from one space to another while
   * preserving straight lines and parallelism.
   *
   * ### Matrix Structure:
   * The affine transform matrix is a 2x3 matrix, represented as:
   *
   * ```
   * [
   *   [a, b, tx],
   *   [c, d, ty]
   * ]
   * ```
   *
   * ### Components:
   * - **a, d**: Scaling factors along the x-axis and y-axis, respectively.
   *   - `a`: Horizontal scale (x-axis stretch/shrink factor).
   *   - `d`: Vertical scale (y-axis stretch/shrink factor).
   * - **b, c**: Shearing (skewing) factors.
   *   - `b`: Horizontal skewing (how much the y-axis tilts along the x-axis).
   *   - `c`: Vertical skewing (how much the x-axis tilts along the y-axis).
   * - **tx, ty**: Translation offsets.
   *   - `tx`: Horizontal translation (movement along the x-axis).
   *   - `ty`: Vertical translation (movement along the y-axis).
   *
   * ### Transformations:
   * Affine transforms combine multiple transformations into a single operation. Examples include:
   * - **Translation**: Moving a shape by tx and ty.
   * - **Scaling**: Resizing along x and y axes.
   * - **Rotation**: Rotating around the origin by combining scaling and skewing.
   * - **Shearing**: Slanting a shape along one or both axes.
   *
   * ### Applying the Transformation:
   * To transform a 2D point `[x, y]`, append a constant `1` to form `[x, y, 1]`,
   * then multiply by the matrix:
   *
   * ```
   * [x', y', 1] = [
   *   [a, b, tx],
   *   [c, d, ty]
   * ] * [x, y, 1]
   *
   * Result:
   * x' = a * x + b * y + tx
   * y' = c * x + d * y + ty
   * ```
   *
   * The transformed point `[x', y']` represents the new coordinates.
   *
   * ### Notes:
   * - This matrix supports 2D transformations only.
   * - It assumes homogeneous coordinates for points (i.e., the constant `1` in `[x, y, 1]`).
   * - For transformations in 3D space, a 4x4 matrix must be used instead.
   */
  export type AffineTransform = [
    [number, number, number],
    [number, number, number],
  ];

  /**
   * the RGBA structure itself. the rgb value may differ as it could both represent 0-1 or 0-255 by the context.
   */
  export type TRGBA = {
    r: number;
    g: number;
    b: number;
    a: number;
  };

  /**
   * Floating-Point RGBA (Normalized RGBA)
   * Used in computer graphics pipelines, shading, and rendering.
   */
  export type RGBAf = {
    /**
     * Red channel value, between 0 and 1.
     */
    r: number;
    /**
     * Green channel value, between 0 and 1.
     */
    g: number;
    /**
     * Blue channel value, between 0 and 1.
     */
    b: number;
    /**
     * Alpha channel value, between 0 and 1.
     */
    a: number;
  };

  /**
   * 8-bit Integer RGBA (Standard RGBA)
   * Used in web and raster graphics, including CSS and images.
   */
  export type RGBA8888 = {
    /**
     * Red channel value, between 0 and 255.
     */
    r: number;
    /**
     * Green channel value, between 0 and 255.
     */
    g: number;
    /**
     * Blue channel value, between 0 and 255.
     */
    b: number;
    /**
     * Alpha channel value, between 0 and 1.
     */
    a: number;
  };

  /**
   * Converts a normalized RGBA color to an 8-bit integer RGBA color.
   * @param rgba - The normalized RGBA color to convert.
   * @returns The 8-bit integer RGBA color.
   * @see {@link RGBAf}
   * @see {@link RGBA8888}
   * @example
   * ```typescript
   * const rgba: RGBAf = { r: 1, g: 0.5, b: 0, a: 0.75 };
   * const rgba8888: RGBA8888 = rgbaf_to_rgba8888(rgba);
   * console.log(rgba8888); // { r: 255, g: 128, b: 0, a: 0.75 }
   * ```
   */
  export function rgbaf_to_rgba8888(rgba: RGBAf): RGBA8888 {
    return {
      r: Math.round(rgba.r * 255),
      g: Math.round(rgba.g * 255),
      b: Math.round(rgba.b * 255),
      a: rgba.a,
    };
  }

  export function rgbaf_multiply_alpha(color: TRGBA, alpha: number): TRGBA {
    return {
      r: color.r,
      g: color.g,
      b: color.b,
      a: color.a * alpha,
    };
  }

  /**
   * Converts a HEX color string to an RGBA8888 object.
   *
   * Supports both short (`#RGB`) and long (`#RRGGBB`) HEX formats.
   *
   * @param hex - The HEX color string to convert. Must start with `#` and be 3 or 6 characters long after the `#`.
   * @returns An object containing `r`, `g`, `b`, and `a` properties.
   *
   * @throws {Error} If the input HEX string is invalid.
   *
   * @example
   * ```typescript
   * hex_to_rgba8888("#F80"); // { r: 255, g: 136, b: 0, a: 1 }
   * hex_to_rgba8888("#FF8800"); // { r: 255, g: 136, b: 0, a: 1 }
   * ```
   */
  export function hex_to_rgba8888(hex: string): cg.RGBA8888 {
    const normalizedHex = hex.replace("#", "");
    let r, g, b;

    if (normalizedHex.length === 3) {
      // Expand short hex to long hex
      r = parseInt(normalizedHex[0] + normalizedHex[0], 16);
      g = parseInt(normalizedHex[1] + normalizedHex[1], 16);
      b = parseInt(normalizedHex[2] + normalizedHex[2], 16);
    } else if (normalizedHex.length === 6) {
      r = parseInt(normalizedHex.substring(0, 2), 16);
      g = parseInt(normalizedHex.substring(2, 4), 16);
      b = parseInt(normalizedHex.substring(4, 6), 16);
    } else {
      throw new Error("Invalid hex format. Expected #RGB or #RRGGBB.");
    }

    return { r, g, b, a: 1 };
  }

  /**
   * Defines a single path
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/path
   */
  export type Path = {
    /**
     * This attribute defines the shape of the path.
     */
    d: string;

    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-rule
     */
    fillRule: FillRule;
  };

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-rule
   * @see https://www.figma.com/plugin-docs/api/properties/VectorPath-windingrule/
   */
  export type FillRule = "nonzero" | "evenodd";

  /**
   *
   * Supported fit modes
   *
   * Only `contain` and `cover`, `none` are supported in the current version.
   *
   * - `none` may have unexpected results by the environment
   *
   * @see https://api.flutter.dev/flutter/painting/BoxFit.html
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit
   */
  export type BoxFit = "contain" | "cover" | "none";

  /**
   * Supported stoke cap modes
   *
   * - `butt`
   * - `round`
   * - `square`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linecap
   * @see https://api.flutter.dev/flutter/dart-ui/StrokeCap.html
   */
  export type StrokeCap = "butt" | "round" | "square";

  /**
   *
   * Supported text decoration modes
   *
   * Only `underline` and `none` are supported in the current version.
   *
   * @see https://api.flutter.dev/flutter/dart-ui/TextDecoration-class.html
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration
   */
  export type TextDecoration = "none" | "underline";

  /**
   * Supported text align modes
   *
   * Does not support `start` and `end` as they are not supported in the current version.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-align
   * @see https://api.flutter.dev/flutter/dart-ui/TextAlign.html
   */
  export type TextAlign = "left" | "right" | "center" | "justify";

  /**
   * Vertical text align modes
   *
   * - [Env:css] in css, uses `align-content`
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-content
   * @see https://konvajs.org/api/Konva.Text.html#verticalAlign
   */
  export type TextAlignVertical = "top" | "center" | "bottom";

  /**
   * Supported font weights in numeric values
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
   * @see https://api.flutter.dev/flutter/dart-ui/FontWeight-class.html
   * @see https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass
   */
  export type NFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

  /**
   * @see https://api.flutter.dev/flutter/painting/Axis.html
   */
  export type Axis = "horizontal" | "vertical";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content
   * @see https://developer.mozilla.org/en-US/docs/Glossary/Main_Axis
   * @see https://api.flutter.dev/flutter/rendering/MainAxisAlignment.html
   */
  export type MainAxisAlignment =
    | "start"
    | "end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
    | "stretch";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-items
   * @see https://developer.mozilla.org/en-US/docs/Glossary/Cross_Axis
   * @see https://api.flutter.dev/flutter/rendering/CrossAxisAlignment.html
   */
  export type CrossAxisAlignment = "start" | "end" | "center" | "stretch";

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
   * @see https://api.flutter.dev/flutter/services/SystemMouseCursors-class.html
   */
  export type SystemMouseCursor =
    | "alias"
    | "all-scroll"
    | "auto"
    | "cell"
    | "col-resize"
    | "context-menu"
    | "copy"
    | "crosshair"
    | "default"
    | "e-resize"
    | "ew-resize"
    | "grab"
    | "grabbing"
    | "help"
    | "move"
    | "n-resize"
    | "ne-resize"
    | "nesw-resize"
    | "no-drop"
    | "none"
    | "not-allowed"
    | "ns-resize"
    | "nw-resize"
    | "nwse-resize"
    | "pointer"
    | "progress"
    | "row-resize"
    | "s-resize"
    | "se-resize"
    | "sw-resize"
    | "text"
    | "vertical-text"
    | "w-resize"
    | "wait"
    | "zoom-in"
    | "zoom-out";

  export type Paint = SolidPaint | LinearGradientPaint | RadialGradientPaint;

  export namespace paints {
    export const transparent: grida.program.cg.Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 0 },
    };

    export const black: grida.program.cg.Paint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 1 },
    };

    export const white: grida.program.cg.Paint = {
      type: "solid",
      color: { r: 255, g: 255, b: 255, a: 1 },
    };
  }

  export type AnyPaint = Omit<
    Partial<SolidPaint> &
      Partial<LinearGradientPaint> &
      Partial<RadialGradientPaint>,
    "type"
  > & { type: Paint["type"] };

  export type PaintWithoutID =
    | SolidPaint
    | Omit<LinearGradientPaint, "id">
    | Omit<RadialGradientPaint, "id">;

  export type SolidPaint = {
    type: "solid";
    color: cg.RGBA8888;
  };

  export type LinearGradientPaint = {
    type: "linear_gradient";
    id: string;
    transform: AffineTransform;
    stops: Array<GradientStop>;
  };

  export type RadialGradientPaint = {
    type: "radial_gradient";
    id: string;
    transform: AffineTransform;
    stops: Array<GradientStop>;
  };

  export type GradientStop = {
    /**
     * 0-1
     * 0 - start (0%)
     * 1 - end (100%)
     */
    offset: number;
    color: cg.RGBA8888;
  };
  //
  //

  /**
   * Box shadow definition compatible with both CSS and advanced blur configurations.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow
   * @see https://api.flutter.dev/flutter/painting/BoxShadow-class.html
   */
  export type BoxShadow = {
    /**
     * The color of the shadow.
     * Defaults to the current color if not provided.
     */
    color: RGBA8888;

    /**
     * The horizontal and vertical offset of the shadow.
     * Example: `[x: number, y: number]` or for no shadow offset.
     *
     * @default [0, 0]
     */
    offset: Vector2;

    /**
     * The blur radius of the shadow.
     * - Specifies the amount of blur applied to the shadow.
     * - Must be >= 0.
     *
     * @default 0
     */
    blur: number;

    /**
     * The spread radius of the shadow.
     * - Positive values expand the shadow.
     * - Negative values shrink the shadow.
     * - Defaults to 0.
     *
     * @default 0
     */
    spread: number;
  };

  export type FilterEffects = FeDropShadow | FeGaussianBlur;

  /**
   *
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
   */
  export type FeDropShadow = {
    type: "drop_shadow";

    /**
     * offset-x
     */
    dx: number;

    /**
     * offset-y
     */
    dy: number;

    /**
     * blur radius
     *
     * a.k.a. stdDeviation in SVG <feDropShadow>
     */
    blur: number;
    //
  };

  export type FeGaussianBlur = {
    type: "blur";

    /**
     * blur radius
     *
     * a.k.a. stdDeviation in SVG <feGaussianBlur>
     */
    radius: number;
  };

  /**
   *
   * [top-left | top-right | bottom-right | bottom-left]
   */
  export type CornerRadius4 = [number, number, number, number];

  export function cornerRadius4Identical(value: CornerRadius4): boolean {
    return (
      value[0] === value[1] && value[1] === value[2] && value[2] === value[3]
    );
  }
}

export namespace grida.program.api {
  export type NodeID = string & {};

  export namespace internal {
    /**
     * @deprecated
     * @returns
     * This model does not work. it's a proof of concept. - will be removed
     */
    export function __createApiProxyNode_experimental(
      node: nodes.Node,
      context: {
        dispatcher: DocumentDispatcher;
      }
    ): nodes.Node {
      const p = new Proxy(
        { ...node },
        {
          get(target, prop, receiver) {
            return Reflect.get(target, prop, receiver);
          },
          set(target, prop, value, receiver) {
            switch (prop as keyof nodes.UnknwonNode) {
              case "width":
                context.dispatcher({
                  type: "node/change/size",
                  axis: "width",
                  node_id: node.id,
                  value: value,
                });
                return true;
              case "height":
                context.dispatcher({
                  type: "node/change/size",
                  axis: "height",
                  node_id: node.id,
                  value: value,
                });
                return true;
              case "top":
              case "right":
              case "bottom":
              case "left":
                context.dispatcher({
                  type: "node/change/positioning",
                  node_id: node.id,
                  positioning: {
                    position: "absolute",
                    [prop]: value,
                  },
                });
                return true;
              case "opacity": {
                context.dispatcher({
                  type: "node/change/opacity",
                  node_id: node.id,
                  opacity: value,
                });
                return true;
              }
              case "rotation": {
                context.dispatcher({
                  type: "node/change/rotation",
                  node_id: node.id,
                  rotation: value,
                });
                return true;
              }
              case "fill": {
                context.dispatcher({
                  type: "node/change/fill",
                  node_id: node.id,
                  fill: value,
                });
                return true;
              }
              case "cornerRadius": {
                context.dispatcher({
                  type: "node/change/cornerRadius",
                  node_id: node.id,
                  cornerRadius: value,
                });
                return true;
              }
              default:
                console.error(`Unsupported property: ${prop.toString()}`);
            }

            return false;
          },
        }
      );
      return p;
    }
  }

  export interface IStandaloneEditorApi {
    selection: ReadonlyArray<NodeID>;
    getNodeById: (node_id: NodeID) => nodes.Node;
    getNodeDepth: (node_id: NodeID) => number;
    getNodeAbsoluteRotation: (node_id: NodeID) => number;

    select: (...selectors: document.Selector[]) => void;
    blur: () => void;
    undo: () => void;
    redo: () => void;
    cut: (target: "selection" | NodeID) => void;
    copy: (target: "selection" | NodeID) => void;
    paste: () => void;
    duplicate: (target: "selection" | NodeID) => void;
    delete: (target: "selection" | NodeID) => void;
    rename: (target: "selection" | NodeID, name: string) => void;

    nudge: (
      target: "selection" | NodeID,
      axis: "x" | "y",
      delta: number
    ) => void;
    nudgeResize: (
      target: "selection" | NodeID,
      axis: "x" | "y",
      delta: number
    ) => void;

    align: (
      target: "selection" | NodeID,
      alignment: {
        horizontal?: "none" | "min" | "max" | "center";
        vertical?: "none" | "min" | "max" | "center";
      }
    ) => void;
    order: (
      target: "selection" | NodeID,
      order: "back" | "front" | number
    ) => void;
    distributeEvenly: (target: "selection" | NodeID[], axis: "x" | "y") => void;

    toggleActive: (target: "selection" | NodeID) => void;
    toggleLocked: (target: "selection" | NodeID) => void;
    toggleBold: (target: "selection" | NodeID) => void;
    setOpacity: (target: "selection" | NodeID, opacity: number) => void;

    createRectangle(
      props: Omit<grida.program.nodes.NodePrototype, "type">
    ): void;
    createEllipse(props: Omit<grida.program.nodes.NodePrototype, "type">): void;
    createText(props: Omit<grida.program.nodes.NodePrototype, "type">): void;

    // defineSchemaProperty: (
    //   name?: string,
    //   definition?: grida.program.schema.PropertyDefinition
    // ) => void;
    // renameSchemaProperty: (name: string, newName: string) => void;
    // updateSchemaProperty: (
    //   name: string,
    //   definition: grida.program.schema.PropertyDefinition
    // ) => void;
    // deleteSchemaProperty: (name: string) => void;

    // configureSurfaceRaycastTargeting: (
    //   config: Partial<SurfaceRaycastTargeting>
    // ) => void;
    configureMeasurement: (measurement: "on" | "off") => void;
    configureTranslateWithCloneModifier: (
      translate_with_clone: "on" | "off"
    ) => void;
    configureTranslateWithAxisLockModifier: (
      tarnslate_with_axis_lock: "on" | "off"
    ) => void;
    configureTransformWithCenterOriginModifier: (
      transform_with_center_origin: "on" | "off"
    ) => void;
    configureTransformWithPreserveAspectRatioModifier: (
      transform_with_preserve_aspect_ratio: "on" | "off"
    ) => void;
    configureRotateWithQuantizeModifier: (
      rotate_with_quantize: number | "off"
    ) => void;
  }
}
