import { jsonSchema } from "ai";

const _$ = "grida-portable-html-tailwind-json";

export type PortableNode = {
  tag: string;
  class?: string;
  style?: string;
  src?: string;
  d?: string;
  attributes?: Record<string, string>;
  children?: PortableNode[] | string;
  text?: string;
};

export type PortableImageReference = { id: string; src: string; alt: string };

export type PortableFontReference = {
  id: string;
  name: string;
};

export type StreamingResponse = {
  object: typeof _$ | string;
  name: string;
  description: string;
  width: number;
  height: number;
  colors: string[];
  html: PortableNode;
  images: PortableImageReference[];
};

/**
 * Hand-written JSON Schema for OpenAI structured output.
 *
 * We use a raw JSON Schema (via `jsonSchema()`) instead of Zod because:
 * - The HTML node tree is recursive (`children` contains more nodes).
 * - OpenAI structured output requires every schema node to have a `type` key.
 * - The AI SDK's Zod-to-JSON-Schema converter either emits `z.any()` as `{}`
 *   (no type) or collapses `z.lazy()` recursion into `any`, both rejected by
 *   OpenAI.
 * - Raw JSON Schema with `$defs` + `$ref` handles recursion correctly.
 */
export const request_schema = jsonSchema<StreamingResponse>({
  type: "object",
  properties: {
    object: { type: "string", enum: [_$] },
    name: { type: "string", description: "name of the design" },
    description: { type: "string", description: "description of the design" },
    colors: {
      type: "array",
      items: { type: "string" },
      description: "list of main colors used in the design - the brand colors",
    },
    width: {
      type: ["number", "null"],
      description: "best width of the design (frame / page) in px",
    },
    height: {
      type: ["number", "null"],
      description: "best height of the design (frame / page) in px",
    },
    html: { $ref: "#/$defs/node" },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          src: { type: "string" },
          alt: { type: "string" },
        },
        required: ["id", "src", "alt"],
        additionalProperties: false,
      },
      description: "images repository, all images used in the file",
    },
    fonts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
        additionalProperties: false,
      },
      description: "fonts repository, all fonts used in the file",
    },
  },
  required: [
    "object",
    "name",
    "description",
    "colors",
    "width",
    "height",
    "html",
    "images",
    "fonts",
  ],
  additionalProperties: false,
  $defs: {
    node: {
      type: "object",
      description: "A portable HTML node",
      properties: {
        tag: { type: "string", description: "semantic html tag" },
        class: {
          type: ["string", "null"],
          description: "list of tailwind classes",
        },
        style: { type: ["string", "null"], description: "inline styles" },
        src: {
          type: ["string", "null"],
          description: "src, primarily for img",
        },
        d: { type: ["string", "null"], description: "SVG path data" },
        text: { type: ["string", "null"], description: "text content" },
        children: {
          type: ["array", "null"],
          items: { $ref: "#/$defs/node" },
          description: "children nodes",
        },
      },
      required: ["tag", "class", "style", "src", "d", "text", "children"],
      additionalProperties: false,
    },
  },
} as any);
