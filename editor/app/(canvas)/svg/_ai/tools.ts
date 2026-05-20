import { tool } from "ai";
import { z } from "zod";

export const TOOL_NAMES = {
  read_file: "read_file",
  update_file: "update_file",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

export const tools = {
  [TOOL_NAMES.read_file]: tool({
    description:
      "Read the current SVG document. Returns the full SVG source and a version number. " +
      "Call this before calling update_file. Re-read whenever update_file returns a 'stale' error.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      content: z.string().describe("The full SVG document source."),
      version: z
        .number()
        .int()
        .describe(
          "Freshness token. Pass this back to update_file as the `version` field."
        ),
    }),
  }),

  [TOOL_NAMES.update_file]: tool({
    description:
      "Replace the entire SVG document with `content`. Fails if the document changed " +
      "since the last read_file in this conversation. On failure with reason='stale', " +
      "call read_file again and retry.",
    inputSchema: z.object({
      content: z
        .string()
        .describe(
          "The complete new SVG document. Must be a valid <svg> element."
        ),
      version: z
        .number()
        .int()
        .describe(
          "The version returned by the most recent read_file. Used to detect concurrent human edits."
        ),
    }),
    outputSchema: z.discriminatedUnion("ok", [
      z.object({
        ok: z.literal(true),
        version: z.number().int().describe("The new version after the write."),
      }),
      z.object({
        ok: z.literal(false),
        reason: z.enum(["not_read", "stale", "parse_error"]),
        message: z.string(),
        current_version: z.number().int().optional(),
      }),
    ]),
  }),
} as const;

export type SvgAgentTools = typeof tools;
