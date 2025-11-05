import { z } from "zod";

/**
 * Tool definitions for AI agent
 */

export const createImageTool = {
  name: "create_image",
  description:
    "Generate an image from a text prompt and insert it into the canvas. Use this when the user wants to create, generate, or add an image.",
  parameters: z.object({
    prompt: z.string().describe("The text prompt describing the image to generate"),
    width: z
      .number()
      .optional()
      .describe("Width of the image in pixels (default: 1024)"),
    height: z
      .number()
      .optional()
      .describe("Height of the image in pixels (default: 1024)"),
    aspect_ratio: z
      .string()
      .optional()
      .describe("Aspect ratio as string like '16:9' or '1:1'"),
  }),
};

export const createTextTool = {
  name: "create_text",
  description:
    "Create or update a text node with the specified content. Use this when the user wants to add, create, or edit text.",
  parameters: z.object({
    text: z.string().describe("The text content to display"),
    node_id: z
      .string()
      .optional()
      .describe(
        "Optional node ID to update existing text. If not provided, creates a new text node."
      ),
    x: z
      .number()
      .optional()
      .describe("X position for new text node (default: center of viewport)"),
    y: z
      .number()
      .optional()
      .describe("Y position for new text node (default: center of viewport)"),
  }),
};

export const createUIComponentsTool = {
  name: "create_ui_components",
  description:
    "Generate UI components as a simplified node structure. Use this for creating layouts, containers, buttons, cards, or other UI elements. This is experimental and supports basic node types: container, text, rectangle, ellipse, image.",
  parameters: z.object({
    nodes: z
      .array(
        z.object({
          type: z
            .enum(["container", "text", "rectangle", "ellipse", "image"])
            .describe("The type of node to create"),
          x: z.number().optional().describe("X position"),
          y: z.number().optional().describe("Y position"),
          width: z.number().optional().describe("Width in pixels"),
          height: z.number().optional().describe("Height in pixels"),
          text: z.string().optional().describe("Text content (for text nodes)"),
          src: z.string().optional().describe("Image source URL (for image nodes)"),
          children: z
            .array(z.any())
            .optional()
            .describe("Child nodes (for container nodes)"),
        })
      )
      .describe("Array of nodes to create"),
  }),
};

export type CreateImageToolParams = z.infer<typeof createImageTool.parameters>;
export type CreateTextToolParams = z.infer<typeof createTextTool.parameters>;
export type CreateUIComponentsToolParams = z.infer<
  typeof createUIComponentsTool.parameters
>;
