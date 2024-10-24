import type { Tokens } from "@/ast";

export namespace grida {
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

      // useful when to decide clear the existing data when component / template changes.
      // if the property signature matches by the name and type (deeply), then the editor can deside to keep the existing user data.
      // function is_equal(a, b, keys){}
    }

    export namespace objects {
      export type ObjectType = Object["type"];
      export type ObjectTypeMap = {
        video: VideoSource;
        audio: AudioSource;
        image: ImageSource;
        youtube: YoutubeVideoSource;
        vimeo: VimeoVideoSource;
        facebook: FacebookVideoSource;
      };

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
        properties: { [name: string]: schema.PropertyDefinition };
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
        overrides: Record<string, nodes.Node>;
      }
    }

    export namespace nodes {
      export type Node = TextNode | InstanceNode;

      export namespace interfaces {
        export interface IStylable {
          attributes?: {
            hidden?: boolean;
          };
          style?: React.CSSProperties;
        }

        export interface IText {
          text: Tokens.StringValueExpression;
        }

        export interface IValues {
          /**
           * properties - props data
           *
           * expression that will be passed to this instance
           */
          values: Record<string, schema.Value>;
        }
      }

      export interface TextNode extends interfaces.IStylable, interfaces.IText {
        type: "text";
      }

      export interface InstanceNode
        extends interfaces.IStylable,
          interfaces.IValues {
        type: "instance";
        /**
         * ID of component that this instance came from, refers to components table
         */
        component_id: string;
      }
    }
  }
}
