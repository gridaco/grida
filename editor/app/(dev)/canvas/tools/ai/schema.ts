import { z } from "zod";

export type PortableNode = {
  tag: string;
  class?: string;
  src?: string;
  d?: string;
  attributes?: Record<string, string>;
  children?: PortableNode[] | string;
};

export type PortableImageReference = { id: string; src: string; alt: string };

export type StreamingResponse = {
  name: string;
  description: string;
  width: number;
  height: number;
  colors: string[];
  html: PortableNode;
  images: PortableImageReference[];
};

export const request_schema = z.object({
  name: z.string().describe("name of the design"),
  description: z.string().describe("description of the design"),
  colors: z
    .array(z.string())
    .describe("list of main colors used in the design - the brand colors"),
  width: z
    .number()
    .optional()
    .describe("best width of the design (frame / page) in px"),
  height: z
    .number()
    .optional()
    .describe("best height of the design (frame / page) in px"),
  html: z
    .object({
      tag: z.string().describe("semantic html tag"),
      class: z.string().optional().describe("list of tailwind classes"),
      src: z.string().optional().describe("src, pimaryly for img"),
      d: z.string().optional().describe("SVG path data"),
      attributes: z.record(z.string()).describe("other attributes"),
      children: z
        .array(z.union([z.string(), z.any()]))
        .describe("children - nodes or text"),
    })
    .describe("the design as html root"),
  images: z
    .array(
      z.object({
        id: z.string(),
        src: z.string(),
        alt: z.string(),
      })
    )
    .describe("images repository, all images used in the file"),
});
