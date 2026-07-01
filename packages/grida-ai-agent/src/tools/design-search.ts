/**
 * `design_search` — the artwork-station gather+curate step, in one human-input
 * turn. The agent proposes a natural-language KEYWORD; the renderer runs the
 * Grida Library search and shows the results; the USER picks the references that
 * fit. The picked pins (image URLs) are the tool result — the visual brief.
 *
 * HUMAN-INPUT (joins `HUMAN_INPUT_TOOL_NAMES`): the call pauses at
 * `input-available` until the user submits their picks, exactly like `question`.
 * The renderer mounts a pick widget above the composer (the search is run
 * client-side — the library client needs the editor session the sidecar lacks,
 * GRIDA-SEC), and the committed picks leave via `addToolResult`.
 *
 * Library pins are URLs, never downloaded: a picked pin's `url` is fed straight
 * into image-to-image as an `input_references` URL (verified — the provider
 * fetches it), so there is no byte-copy and no `.canvas` materialization for v1.
 *
 * Per the TOOL-DESIGN doctrine (`tools/index.ts`): a single natural-language
 * `query`. Result count + collection scoping are host concerns, not agent knobs.
 */

import { tool } from "ai";
import { z } from "zod";

export namespace AgentDesignSearch {
  export const TOOL_NAME = "design_search" as const;
  export type ToolName = typeof TOOL_NAME;

  const INPUT = z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe(
        "What kind of reference to gather, in natural language — describe the " +
          'subject, mood, style, palette, or composition (e.g. "calm minimal ' +
          'abstract background, warm earth tones", "bold retro concert poster ' +
          'typography"). The user picks from the results; call again for a new angle.'
      ),
  });

  /** One reference pin (a library object). Used for both the searched results
   *  the renderer shows and the subset the user picks. */
  export type DesignSearchResult = {
    /** Library object id — the stable handle for the pin. */
    id: string;
    title: string;
    /** Public image URL — rendered as a thumbnail; fed to i2i as a reference. */
    url: string;
    width?: number;
    height?: number;
  };

  /** The tool result: the references the USER picked (the visual brief). */
  export type DesignSearchOutput = {
    picked: DesignSearchResult[];
    /** True when the user dismissed without picking — proceed without references. */
    skipped?: boolean;
  };

  const RESULT = z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
  });
  const OUTPUT = z.object({
    picked: z.array(RESULT),
    skipped: z.boolean().optional(),
  });

  export const HEADLESS_REFUSAL =
    "design_search is unavailable here: there is no UI session to search the " +
    "Grida Library and pick references. Proceed without references and say so.";

  /**
   * Build the tool. `interactive` ⇒ no `execute`: the call pauses for the user's
   * picks, which the renderer supplies via `addToolResult` (it is in
   * `HUMAN_INPUT_TOOL_NAMES`, so the drain waits). A headless host gets a fixed
   * refusal. Mirrors `createQuestionTool`.
   */
  export function createTool(opts: { interactive: boolean }) {
    const base = {
      description:
        "Gather visual references: SEARCH the Grida Library for a description, " +
        "then the USER picks the ones that fit (a reference/mood board). Returns " +
        "the picked references (id, title, image url). Use the picked images as " +
        "inputs when you generate — they condition the result. Call again with a " +
        "new description to gather a different direction.",
      inputSchema: INPUT,
      outputSchema: OUTPUT,
      toModelOutput: ({ output }: { output: unknown }) =>
        toModelOutput(output as DesignSearchOutput),
    } as const;
    if (opts.interactive) return tool(base);
    return tool({
      ...base,
      execute: async () => {
        throw new Error(HEADLESS_REFUSAL);
      },
    });
  }

  type ToolContent = { type: "text"; value: string };

  /**
   * Lower the picks to TEXT for the model — an id-tagged list of each pin's URL,
   * never image bytes (the human saw the thumbnails) and never the Library
   * `title`. The url is the only payload the agent needs (to build on a pick it
   * passes that url as a `references` entry to `generate_image`); the title is
   * asset-supplied metadata, so keeping it out of model-visible text avoids
   * letting a Library object's caption steer the agent. Turning picks into
   * references is the agent's job — this tool just reports what was chosen.
   */
  export function toModelOutput(output: DesignSearchOutput): ToolContent {
    if (output.skipped || output.picked.length === 0) {
      return {
        type: "text",
        value:
          "The user picked no references. Proceed from the prompt alone, or " +
          "search again with a different description.",
      };
    }
    const lines = output.picked.map((r, i) => `${i + 1}. [${r.id}] ${r.url}`);
    return {
      type: "text",
      value:
        `The user picked ${output.picked.length} reference${output.picked.length === 1 ? "" : "s"} as the brief. ` +
        `To condition an image on them, pass their urls as \`references\` when you ` +
        `call generate_image:\n` +
        lines.join("\n"),
    };
  }
}
