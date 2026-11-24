import type {
  NativeSubagentClient,
  NativeSubagentExecution,
} from "@grida/desktop-bridge";
import { DesktopConversationFixtures } from "./desktop-conversation-fixtures";

type SubagentReads = Required<
  Pick<
    NativeSubagentClient,
    "subagentConversation" | "listSubagents" | "inspectSubagent"
  >
>;

const reviews: Record<string, { instruction: string; text: string }> = {
  "layout-review": {
    instruction: "Check whether the gallery map and legend fit on the handout.",
    text: "Give the map legend more space. It should sit below the floor plan so its labels are easy to scan.",
  },
  "copy-review": {
    instruction: "Check the captions against the exhibition notes.",
    text: "I found the captions in the handout. The exhibition notes were unavailable.",
  },
  "accessibility-review": {
    instruction: "Check the handout for print accessibility.",
    text: "I started checking the text size and contrast.",
  },
};

const execution: NativeSubagentExecution = {
  model: "Example model A",
  effort: "medium",
};

/** Reads the same recorded child assignments that appear in the parent transcript. */
export namespace DesktopSubagentFixture {
  export function forParent(parentAttachmentId: string): SubagentReads {
    const activity =
      DesktopConversationFixtures.get("subagents").subagentActivity;
    if (!activity) throw new Error("fixture_subagent_activity_unavailable");

    function checkParent(attachmentId: string) {
      if (attachmentId !== parentAttachmentId)
        throw new Error("fixture_subagent_parent_unavailable");
    }

    const assignment = (attachmentId: string, childId: string) => {
      checkParent(attachmentId);
      const child = activity.children.find(
        (entry) => entry.childId === childId
      );
      const started = activity.events.find(
        (event) => event.childId === childId && event.kind === "started"
      );
      const finished = activity.events.find(
        (event) => event.childId === childId && event.kind === "finished"
      );
      const review = reviews[childId];
      if (!child || !started || !finished?.status || !review)
        throw new Error("fixture_subagent_unavailable");
      return { child, started, finished, status: finished.status, review };
    };

    return {
      listSubagents: async (attachmentId, afterChildId) => {
        checkParent(attachmentId);
        if (afterChildId) throw new Error("fixture_subagent_page_unavailable");
        return {
          children: activity.children.map(({ childId, name }) => ({
            childId,
            name,
          })),
          nextAfterChildId: null,
        };
      },
      subagentConversation: async (attachmentId, childId, before) => {
        const { child, started, finished, status, review } = assignment(
          attachmentId,
          childId
        );
        if (before) throw new Error("fixture_subagent_page_unavailable");
        return {
          childId,
          name: child.name,
          kind: child.kind,
          view: 1,
          messages: [
            {
              messageId: started.inputId,
              inputId: started.inputId,
              turnId: started.childTurnId,
              role: "user",
              text: review.instruction,
            },
            {
              messageId: `${childId}-reply`,
              turnId: started.childTurnId,
              role: "assistant",
              phase: status === "succeeded" ? "answer" : "progress",
              text: review.text,
            },
          ],
          turns: [
            {
              turnId: started.childTurnId,
              status,
              startedAtMs: started.atMs,
              settledAtMs: finished.atMs,
              execution,
            },
          ],
          execution,
          older: null,
          live: { available: true, truncated: false },
          observedAtMs: activity.observedAtMs,
        };
      },
      inspectSubagent: async (attachmentId, childId, inputId) => {
        const { child, started, status, review } = assignment(
          attachmentId,
          childId
        );
        if (inputId && inputId !== started.inputId)
          throw new Error("fixture_subagent_assignment_unavailable");
        return {
          child: {
            childId,
            name: child.name,
            workTurns: 1,
            reserved: 1,
            admissionPaused: status === "cancelled",
            queuedInputIds: [],
            current: null,
            assignment: {
              inputId: started.inputId,
              parentTurnId: started.parentTurnId,
              instructionPreview: review.instruction,
              instructionTruncated: false,
              disposition: "completed",
              turn: {
                turnId: started.childTurnId,
                disposition: "settled",
                status,
                paused: false,
                cancelled: status === "cancelled",
              },
              result: {
                turnId: started.childTurnId,
                status,
                text: status === "succeeded" ? review.text : "",
                textTruncated: false,
              },
            },
          },
          stopObservationId: null,
        };
      },
    };
  }
}
