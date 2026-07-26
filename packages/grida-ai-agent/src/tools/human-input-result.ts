// GRIDA-SEC-004 — a renderer may resolve only a server-authored human-input
// block, and its terminal payload must satisfy that tool's canonical schema
// before the runtime consumes the pending interaction.

import type { AgentRunMessagePart } from "../protocol/run";
import { AgentDesignSearch } from "./design-search";
import {
  DESIGN_SEARCH_TOOL_NAME,
  QUESTION_TOOL_NAME,
  type HUMAN_INPUT_PART_TYPES,
} from "./names";
import { questionOutputSchema } from "./question";

type HumanInputPartType = (typeof HUMAN_INPUT_PART_TYPES)[number];

const QUESTION_PART_TYPE = `tool-${QUESTION_TOOL_NAME}` as const;
const DESIGN_SEARCH_PART_TYPE = `tool-${DESIGN_SEARCH_TOOL_NAME}` as const;

/**
 * Validate the renderer-authored terminal fields of one exact human-input
 * continuation. The persisted tool identity and input stay server-owned; this
 * boundary validates only the output/error the renderer is allowed to supply.
 */
export function isValidHumanInputResultPart(
  part: AgentRunMessagePart & {
    type: HumanInputPartType;
    state: "output-available" | "output-error";
  }
): boolean {
  if (part.state === "output-error") {
    const errorText = part.errorText ?? part.error_text;
    return typeof errorText === "string";
  }

  switch (part.type) {
    case QUESTION_PART_TYPE:
      return questionOutputSchema.safeParse(part.output).success;
    case DESIGN_SEARCH_PART_TYPE:
      return AgentDesignSearch.outputSchema.safeParse(part.output).success;
    default:
      return false;
  }
}
