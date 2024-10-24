import type { ZodObject } from "zod";
import type { Tokens } from "@/ast";

export namespace grida {
  export namespace program {
    export namespace schema {
      export type Value =
        | Tokens.NumericValueExpression
        | Tokens.StringValueExpression
        | Tokens.StringValueExpression[]
        | { [key: string]: Value };

      export type PropertyDefinition =
        | TypeScalarPropertyDefinition
        | TypeArrayPropertyDefinition<any[]>
        | TypeObjectPropertyDefinition<any>
        | TypeWellKnownObjectPropertyDefinition;

      interface TypeScalarPropertyDefinition {
        type: "string" | "number" | "boolean";
        default?:
          | Tokens.StringValueExpression
          | Tokens.NumericValueExpression
          | Tokens.BooleanValueExpression;
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
    }

    export namespace objects {
      export type ObjectType = Object["type"];
      export type Object = Source | VideoPlayerSource;

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

    export namespace template {
      export interface TemplateDefinition {
        name: string;
        version: string;
        type: "template";
        // properties: { [name: string]: schema.PropertyDefinition };
        default: Record<string, schema.Value>;
        //
      }

      /**
       * [Template Node] Template node is a static, hand crafted template that does not have a intrinsic tree, only a root properties [data] and [overrides] to each customizable node
       *
       * Template Node cannot be used as a child node.
       *
       * This will be used until we have a fully working tree editor.
       */
      export interface TemplateInstance extends TemplateDefinition {
        /**
         * arguments matching properties
         */
        values: Record<string, schema.Value>;

        /**
         * exposed child node overrides
         */
        overrides: Record<string, Node>;
      }
    }
  }
}

export interface IDocumentSelectedNodeState {
  selected_node_id?: string;
  selected_node_type?: string;
  selected_node_schema?: ZodObject<any> | null;
  selected_node_default_properties?: Record<string, any>;
  selected_node_default_style?: React.CSSProperties;
  selected_node_default_text?: Tokens.StringValueExpression;
  selected_node_context?: Record<string, any>;
}

type Node = TextNode | InstanceNode;

interface IStylable {
  attributes?: {
    hidden?: boolean;
  };
  style?: React.CSSProperties;
}

interface IText {
  text: Tokens.StringValueExpression;
}

export type Values = {
  [key: string]:
    | Tokens.NumericValueExpression
    | Tokens.StringValueExpression
    | Tokens.StringValueExpression[]
    | Values;
};

interface IProperties {
  /**
   * properties - props data
   *
   * expression that will be passed to this instance
   */
  properties: Values;
}

export interface TextNode extends IStylable, IText {
  type: "text";
}

export interface InstanceNode extends IStylable, IProperties {
  type: "instance";
  /**
   * ID of component that this instance came from, refers to components table
   */
  component_id: string;
}

/**
 * [Template Node] Template node is a static, hand crafted template that does not have a intrinsic tree, only a root properties [data] and [overrides] to each customizable node
 *
 * Template Node cannot be used as a child node.
 *
 * This will be used until we have a fully working tree editor.
 */
// interface TemplateNode extends IProperties {
//   type: "template";

//   /**
//    * ID of template that this instance came from
//    */
//   template_id: string;

//   /**
//    * children override data
//    */
//   overrides: {
//     [node_id: string]: Node;
//   };
// }

export interface ITemplateEditorState extends IDocumentSelectedNodeState {
  template: grida.program.template.TemplateInstance;
}
