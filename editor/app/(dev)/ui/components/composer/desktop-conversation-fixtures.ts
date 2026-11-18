import type {
  NativeChatMessage,
  NativeChatMessageAttachment,
  NativeChatTurnRecord,
} from "@grida/desktop-bridge";
import { DesktopComposerFixtures } from "./desktop-fixtures";

/** Small recorded examples for the production transcript renderer. */
export namespace DesktopConversationFixtures {
  export type Scenario =
    | "text"
    | "attachments"
    | "svg-selection"
    | "activity"
    | "streaming"
    | "empty";
  export type Example = Readonly<{
    id: Scenario;
    label: string;
    messages: readonly NativeChatMessage[];
    records?: readonly NativeChatTurnRecord[];
    streamingMessageId?: string;
  }>;

  /** Fixed display times keep hover actions deterministic between visits. */
  export const startedAtMs = Date.UTC(2026, 10, 16, 0, 0);
  const missingImage: NativeChatMessageAttachment = {
    name: "unavailable-reference.jpg",
    mimeType: "image/jpeg",
    previewId: "local-fixture-missing-image",
  };

  export const scenarios: readonly Example[] = [
    {
      id: "text",
      label: "Text and Markdown",
      messages: [
        {
          messageId: "text-user",
          role: "user",
          text: "Refine this composer.\n\nKeep the draft when a menu closes, and make queued messages easy to inspect.",
        },
        {
          messageId: "text-assistant",
          role: "assistant",
          text: '### Composer review\n\nThe composer keeps your draft and shares one menu placement.\n\n- Open **+** or type `/` for commands.\n- Hover a queued message to read its full text.\n- Use **Steer** to submit without interrupting the model.\n\n```ts\nconst message = { text: "Keep the draft" };\n```',
        },
      ],
    },
    {
      id: "attachments",
      label: "Attachments",
      messages: [
        {
          messageId: "attachment-caption",
          role: "user",
          text: "Use this image as the visual reference.\nKeep the spacing and rounded corners consistent.",
          attachments: [DesktopComposerFixtures.image],
        },
        {
          messageId: "attachment-response",
          role: "assistant",
          text: "I can use the image as a reference. Its preview stays separate from your message text.",
        },
        {
          messageId: "attachment-only",
          role: "user",
          text: "",
          attachments: [DesktopComposerFixtures.image],
        },
        {
          messageId: "attachment-files",
          role: "user",
          text: "Also check the attached notes and folder.",
          attachments: [
            DesktopComposerFixtures.file,
            { name: "assets", mimeType: "inode/directory" },
          ],
        },
        {
          messageId: "attachment-missing",
          role: "user",
          text: "This older image no longer has a preview.",
          attachments: [missingImage],
        },
      ],
    },
    {
      id: "svg-selection",
      label: "SVG text selection",
      messages: [
        {
          messageId: "svg-selection-request",
          role: "user",
          text: "What does the selected text say?",
          svgTextSelection: true,
        },
        {
          messageId: "svg-selection-answer",
          role: "assistant",
          text: "The selected text says “Quiet tide.”",
        },
      ],
    },
    {
      id: "activity",
      label: "Tool activity",
      records: [
        {
          turnId: "fixture-activity-turn",
          status: "succeeded",
          startedAtMs,
          settledAtMs: startedAtMs + 5200,
        },
      ],
      messages: [
        {
          messageId: "activity-user",
          role: "user",
          text: "Read the composer notes and check the example.",
          turnId: "fixture-activity-turn",
        },
        {
          messageId: "activity-work",
          role: "assistant",
          text: "I’ll read the notes, then check the example.",
          turnId: "fixture-activity-turn",
          phase: "progress",
          activity: [
            {
              callId: "fixture-read",
              title: "read_file",
              kind: "read",
              outcome: "succeeded",
              input: { path: "README.md" },
              output: {
                text: "# Composer\n\nKeep the draft and make queue actions discoverable.\n",
                truncated: false,
              },
            },
            {
              callId: "fixture-command",
              title: "exec_command",
              kind: "execute",
              outcome: "succeeded",
              input: { cmd: "pnpm test composer" },
              output: {
                text: "Wall time: 0.8 seconds\nProcess exited with code 0\nOutput:\n4 examples passed\n",
                truncated: false,
              },
            },
          ],
        },
        {
          messageId: "activity-answer",
          role: "assistant",
          text: "The example preserves the draft and exposes the queue actions.\n\nThe recorded read and command are available under **Worked for 5s**.",
          turnId: "fixture-activity-turn",
          phase: "answer",
        },
      ],
    },
    {
      id: "streaming",
      label: "Streaming",
      streamingMessageId: "streaming-assistant",
      messages: [
        {
          messageId: "streaming-user",
          role: "user",
          text: "Describe what you are checking as you work.",
        },
        {
          messageId: "streaming-assistant",
          role: "assistant",
          text: "I’m checking the composer’s keyboard navigation and attachment layout.\n\nNext I’ll compare the narrow layout and",
        },
      ],
    },
    { id: "empty", label: "Empty conversation", messages: [] },
  ];

  export function get(id: Scenario): Example {
    return scenarios.find((example) => example.id === id)!;
  }

  /** Exact fixture token only; unknown tokens exercise the named fallback. */
  export const readImage = DesktopComposerFixtures.readImage;
}
