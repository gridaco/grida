import type { Editor } from "@/grida-canvas/editor";
import ai from "@/lib/ai";
import cg from "@grida/cg";
import cmath from "@grida/cmath";
import { tool } from "ai";
import { z } from "zod";
import type { GenerateImageApiResponse } from "@/app/(api)/private/ai/generate/image/route";
import { Env } from "@/env";
import artboard_data from "@/grida-canvas-react-starter-kit/data/artboards.json";

export namespace canvas_use {
  export namespace tools_spec {
    const __NS_NAME_CANVAS_USE = "canvas_use";
    const __NS_NAME_PLATFORM_SYS = "platform_sys";
    type NS_NAME_CANVAS_USE = `${typeof __NS_NAME_CANVAS_USE}_${string}`;
    type NS_NAME_PLATFORM_SYS = `${typeof __NS_NAME_PLATFORM_SYS}_${string}`;
    export const name_platform_sys_tool_ai_fetch_preflight =
      "platform_sys_fetch_preflight" satisfies NS_NAME_PLATFORM_SYS;
    export const name_platform_sys_tool_ai_image_model_cards =
      "platform_sys_ai_image_model_cards" satisfies NS_NAME_PLATFORM_SYS;
    export const name_platform_sys_tool_ai_generate_image =
      "platform_sys_generate_image";

    export const name_man = "canvas_use_man" satisfies NS_NAME_CANVAS_USE;
    export const name_tree = "canvas_use_tree" satisfies NS_NAME_CANVAS_USE;
    export const name_make_from_svg =
      "canvas_use_make_from_svg" satisfies NS_NAME_CANVAS_USE;
    export const name_make_from_image =
      "canvas_use_make_from_image" satisfies NS_NAME_CANVAS_USE;
    export const name_make_from_markdown =
      "canvas_use_make_from_markdown" satisfies NS_NAME_CANVAS_USE;
    export const name_data_artboard_sizes =
      "canvas_use_data_artboard_sizes" satisfies NS_NAME_CANVAS_USE;

    export const platform_sys_tool_ai_fetch_preflight = tool({
      description:
        "A general fetch() utility, with HEAD. used for validating web resources.",
      inputSchema: z.object({
        url: z.string().describe("The URL to fetch preflight information for"),
      }),
      execute: async ({ url }) => {
        const response = await fetch(url, {
          method: "HEAD",
        });
        return response.json();
      },
    });

    export const platform_sys_tool_ai_image_model_cards = tool({
      description:
        "Get the model cards list of Grida Platform supported AI image models",
      inputSchema: z.object({
        level: z
          .enum(["verbose", "compact"])
          .describe("The level of detail to return")
          .optional(),
      }),
      execute: async ({ level }) => {
        switch (level) {
          case "verbose":
            return ai.image.models;
          case "compact": {
            // reduce
            return Object.values(ai.image.models).reduce(
              (acc, model) => {
                acc[model!.id] = ai.image.toCompact(model!);
                return acc;
              },
              {} as Record<
                ai.image.ImageModelId,
                ai.image.ImageModelCardCompact
              >
            );
          }
        }
      },
    });

    /**
     * Generate Image Tool
     *
     * Generates an image from a text prompt using Replicate's Flux model.
     * Returns the image URL after uploading to Supabase storage.
     *
     * From: https://ai-sdk.dev/cookbook/next/generate-image-with-chat-prompt
     */
    export const platform_sys_tool_ai_generate_image = tool({
      description:
        "Generate an image from a text prompt. Use this when the user wants to create, generate, or visualize an image.",
      inputSchema: z.object({
        model_id: z
          .string()
          .describe("The model id to use for image generation.")
          .optional(),
        prompt: z
          .string()
          .describe("The text prompt describing the image to generate"),
        aspect_ratio: z
          .string()
          .optional()
          .describe(
            "Aspect ratio as string like '16:9' or '1:1' (default: 1:1)"
          ),
        width: z
          .number()
          .optional()
          .describe("The width of the image to generate"),
        height: z
          .number()
          .optional()
          .describe("The height of the image to generate"),
      }),
      outputSchema: z.object({
        object: z.object({
          id: z.string().describe("The id of the generated image"),
          bytes: z.number().describe("The bytes of the generated image"),
          width: z.number().describe("The width of the generated image"),
          height: z.number().describe("The height of the generated image"),
          mimetype: z.string().describe("The mimetype of the generated image"),
        }),
        width: z.number().describe("The width of the generated image"),
        height: z.number().describe("The height of the generated image"),
        publicUrl: z.string().describe("The URL of the generated image"),
        timestamp: z.string().describe("The timestamp of the image generation"),
        modelId: z.string().describe("The model id used for image generation"),
      }),
      execute: async ({
        prompt,
        aspect_ratio,
        width,
        height,
        model_id = "black-forest-labs/flux-schnell",
      }) => {
        try {
          // TODO: dev only - this will only work on local dev
          // POST to the unified API route so auth/ratelimit/storage are centralized
          const response = await fetch(
            `${Env.web.HOST}/private/ai/generate/image`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                prompt,
                width,
                height,
                aspect_ratio: (aspect_ratio || "1:1") as `${number}:${number}`,
                model: model_id,
              }),
            }
          );

          if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(
              `Image generation failed (${response.status}): ${text || "Unknown error"}`
            );
          }

          const { data } = (await response.json()) as GenerateImageApiResponse;

          return data;
        } catch (error) {
          console.error("Error generating image:", error);
          throw new Error(
            error instanceof Error ? error.message : "Failed to generate image"
          );
        }
      },
      // toModelOutput(result) {
      //   return {
      //     type: "content",
      //     value: [
      //       {
      //         type: "image-url",
      //         url: result.publicUrl,
      //       },
      //     ],
      //   };
      // },
    });

    export const man = tool({
      description: "Display the manual page for the given tool.",
      inputSchema: z.object({
        tool: z
          .string()
          .describe("The name of the tool to display the manual page for"),
      }),
      outputSchema: z.object({
        description: z.string().describe("The description of the tool"),
        examples: z.array(z.string()).describe("The examples of the tool"),
      }),
    });

    export const tree = tool({
      description: "Display the tree structure of the canvas.",
      inputSchema: z.object({
        entry_id: z
          .string()
          .describe(
            "The id of the entry to display the tree for. leave blank for root document"
          )
          .optional(),
      }),
      outputSchema: z.object({
        tree: z.string().describe("The tree-as-text structure of the canvas"),
      }),
    });

    export const make_from_svg = tool({
      title: "Create Node from SVG",
      description:
        "Create a node from an SVG string under new container node. Return the ID of the created node.",
      inputSchema: z.object({
        svg: z.string().describe("The SVG string to create a node from"),
      }),
      outputSchema: z.object({
        node_id: z.string().describe("The ID of the created node"),
      }),
    });

    export const make_from_image = tool({
      title: "Create Image Node",
      description:
        "Create a image node from with optional image source. If no image source is provided, it still creates a image node with placeholder checker image.",
      inputSchema: z.object({
        name: z.string().describe("The name of the node").optional(),
        width: z.number().describe("The width of the node").optional(),
        height: z.number().describe("The height of the node").optional(),
        image_url: z
          .url()
          .describe(
            "The image URL to create a node from (supports PNG, JPEG, WebP)"
          )
          .optional(),
      }),
      outputSchema: z.object({
        node_id: z.string().describe("The ID of the created node"),
      }),
    });

    export const make_from_markdown = tool({
      title: "Create Node from Markdown",
      description:
        "Create a node from a markdown string with new text node. Return the ID of the created node.",
      inputSchema: z.object({
        markdown: z
          .string()
          .describe("The markdown string to create a node from"),
      }),
      outputSchema: z.object({
        node_id: z.string().describe("The ID of the created node"),
      }),
    });

    export const data_artboard_sizes = tool({
      description: "Get the list of commonly defined artboard sizes",
      inputSchema: z.object({}),
      execute: async () => {
        return artboard_data;
      },
    });
  }

  export namespace client_impls {
    type ToolCallOutput<OUTPUT> =
      | {
          state?: "output-available";
          errorText?: never;
          output: OUTPUT;
        }
      | {
          state: "output-error";
          errorText: string;
        };

    export async function tree(
      editor: Editor,
      params: {
        entry_id?: string;
      }
    ): Promise<ToolCallOutput<{ tree: string }>> {
      return {
        state: "output-available",
        output: {
          tree: editor.tree(params.entry_id),
        },
      };
    }

    export async function make_from_svg(
      editor: Editor,
      params: {
        svg: string;
      }
    ): Promise<ToolCallOutput<{ node_id: string }>> {
      try {
        const n = await editor.commands.createNodeFromSvg(params.svg);
        return {
          state: "output-available",
          output: {
            node_id: n.id,
          },
        };
      } catch (e) {
        return {
          state: "output-error",
          errorText: String(e),
        };
      }
    }

    export async function make_from_image(
      editor: Editor,
      params: {
        name?: string;
        image_url?: string | undefined;
        width?: number;
        height?: number;
      }
    ): Promise<ToolCallOutput<{ node_id: string }>> {
      try {
        if (params.image_url) {
          const image_ref = await editor.createImageAsync(params.image_url);

          const node = editor.commands.createRectangleNode();
          node.$.position = "absolute";
          node.$.name = params.name || "image";
          node.$.width = params.width || image_ref.width;
          node.$.height = params.height || image_ref.height;
          node.$.fill_paints = [
            {
              type: "image",
              src: image_ref.url,
              fit: "cover",
              transform: cmath.transform.identity,
              filters: cg.def.IMAGE_FILTERS,
              blend_mode: cg.def.BLENDMODE,
              opacity: 1,
              active: true,
            } satisfies cg.ImagePaint,
          ];
          return {
            state: "output-available",
            output: {
              node_id: node.id,
            },
          };
        } else {
          const node = editor.commands.createRectangleNode();
          node.$.position = "absolute";
          node.$.fill_paints = [
            {
              type: "image",
              src: "",
              fit: "cover",
              transform: cmath.transform.identity,
              filters: cg.def.IMAGE_FILTERS,
              blend_mode: cg.def.BLENDMODE,
              opacity: 1,
              active: true,
            } satisfies cg.ImagePaint,
          ];
          return {
            state: "output-available",
            output: {
              node_id: node.id,
            },
          };
        }
      } catch (e) {
        return {
          state: "output-error",
          errorText: String(e),
        };
      }
    }

    export async function make_from_markdown(
      editor: Editor,
      params: {
        markdown: string;
      }
    ): Promise<ToolCallOutput<{ node_id: string }>> {
      try {
        // TODO: markdown formatting is not supported yet. just plain txt for now.
        const node = editor.commands.createTextNode(params.markdown);
        return {
          state: "output-available",
          output: {
            node_id: node.id,
          },
        };
      } catch (e) {
        return {
          state: "output-error",
          errorText: String(e),
        };
      }
    }
  }

  export namespace llm {
    export const instructions = `
    You are [Grida Assistant], a design copilot helping users create, plan, and implement designs in a canvas editor.

    You are physically placed on the canvas, user expects you to output design directly on the canvas when ever possible.


    <manners>
    - Share your progress: Before and after calling tools or performing actions, first describe what you will do, did so user can expect the result and know what you are up to.
    - Be honest: If you are not capable of performing the request, be honest and try to suggest alternative solutions.

      <markdown_formatting>
      Markdown formatting guideline in your chat response.
      - Use structured output: use bullet lists, tables try response in structured format.
      - Prefer table over list when the data is tabular.
      
        <uri>
        Grida chat supports uri highlight for valid links that points to user resources.
        - node: "[<name>](grida://node/<id>)"
        - color: "[#000000](grida://color/<css_color_format>)"
        </uri>
      </markdown_formatting>
    </manners>


    <canvas>
    Grida Canvas is a gpu accelerated canvas editor, it's a modern design tool that allows you to create, edit, and share designs with others.

    - Vector Network Model: Grida Canvas uses Vector Network format for vector graphics. while Grida Canvas does not directly support SVG node, it has good support for SVG import.
    - Layout Model: Grida Canvas supports flexbox model and anchor model.
    - Container Model: Grida container node is equivalant to 'div' in html.
    - Group Model: Grida group node is equivalant to 'g' in svg.
    - Vision Export Model: Grida Canvas supports export to PNG, JPEG, WebP, SVG, PDF.
    - Code Export Model: Grida Canvas supports code export to JSON, html/css.


      <nodes>
      - container: a.k.a frame, this is equivalant to 'div' in html.
      - group: a group of nodes, a virtual logical grouping of nodes. there is no physical assiciation to html, its more like a 'g' in svg.
      - rectangle: a rectangular shape.
      - ellipse: an elliptical shape.
      - polygon: a regular polygon shape.
      - star: a star shape.
      - line: a line shape.
      - text: a text shape.
      - image: an image shape.
      </nodes>


      <types>
      - Paint: solid | gradient | image
      - GradientPaint: linear | radial | sweep | diamond
      - FilterEffect: drop_shadow | inner_shadow | layer_blur | backdrop_blur | noise | liquid_glass
      </types>


      <properties>
      - fill_paints: similar to svg 'fill', can be stacked as many as needed. (fill Paint[])
      - stroke_paints: similar to svg 'stroke', can be stacked as many as needed. (stroke Paint[]) / Grida does not have dedicated 'border' stroke is the universal model we use.
      - corner_radius: corner radius of the node. (applicable to all shapes, including rectangular shapes).
      - rectangular_stroke_width_top: stroke rect's top width (applicable to rectangular shapes, otherwise ignored).
      - rectangular_stroke_width_right: stroke rect's right width (applicable to rectangular shapes, otherwise ignored).
      - rectangular_stroke_width_bottom: stroke rect's bottom width (applicable to rectangular shapes, otherwise ignored).
      - rectangular_stroke_width_left: stroke rect's left width (applicable to rectangular shapes, otherwise ignored).
      - rectangular_corner_radius_top_left: corner radius of the top left corner of the node. (applicable to rectangular shapes, otherwise ignored).
      - rectangular_corner_radius_top_right: corner radius of the top right corner of the node. (applicable to rectangular shapes, otherwise ignored).
      - rectangular_corner_radius_bottom_right: corner radius of the bottom right corner of the node. (applicable to rectangular shapes, otherwise ignored).
      - rectangular_corner_radius_bottom_left: corner radius of the bottom left corner of the node. (applicable to rectangular shapes, otherwise ignored).
      - effects: effects are array representation of filters (some filter can be applied only once. - e.g. layer blur can be used only once per node)
      </properties>
    </canvas>



    <tools>
    - ${tools_spec.name_platform_sys_tool_ai_fetch_preflight}: fetch preflight information for the given URL.
    - ${tools_spec.name_platform_sys_tool_ai_image_model_cards}: list the available image model cards. try to use cheapest one for low-effort generation.
    - ${tools_spec.name_platform_sys_tool_ai_generate_image}: generate an AI image from a text prompt.
    - ${tools_spec.name_tree}: display the tree structure of the canvas.
    - ${tools_spec.name_make_from_svg}: create a node from SVG string.
    - ${tools_spec.name_make_from_image}: create a node from image (non svg) URL.
    - ${tools_spec.name_make_from_markdown}: create a node from markdown string.
    - ${tools_spec.name_data_artboard_sizes}: get the list of commonly defined artboard sizes.
    </tools>
    `;
  }
}
