import type {
  NativeChatQuestion,
  NativeChatMessage,
  NativeChatMessageAttachment,
  NativeChatTurnRecord,
  NativeSubagentActivityPage,
} from "@grida/desktop-bridge";
import { DesktopComposerFixtures } from "./desktop-fixtures";

/** Small recorded examples for the production transcript renderer. */
export namespace DesktopConversationFixtures {
  export type Scenario =
    | "text"
    | "question"
    | "blocking-question"
    | "question-batch"
    | "multiple-questions"
    | "attachments"
    | "inline-workspace-images"
    | "svg-selection"
    | "activity"
    | "subagents"
    | "streaming"
    | "compaction"
    | "time-dividers"
    | "paused"
    | "suggested-prompt"
    | "web-preview"
    | "loading"
    | "reconnect"
    | "approval"
    | "library-request"
    | "empty";
  export type Example = Readonly<{
    id: Scenario;
    messages: readonly NativeChatMessage[];
    records?: readonly NativeChatTurnRecord[];
    subagentActivity?: NativeSubagentActivityPage;
    questions?: readonly NativeChatQuestion[];
    streamingMessageId?: string;
    activeTurnId?: string;
  }>;

  /** Fixed display times keep hover actions deterministic between visits. */
  export const startedAtMs = Date.UTC(2026, 10, 16, 0, 0);
  export const workspaceImagePath = "Wind Garden.canvas/previews/cover.webp";
  export const suggestedPrompt =
    "Show me two alternate cover layouts. In the first, give the photograph more room and move the title toward the bottom. In the second, let the title lead and use a smaller crop of the photograph. Keep the same typeface and colors so I can compare the layouts side by side.";
  const partialReply = {
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
        text: [
          "I’m checking the composer’s keyboard navigation and attachment layout.",
          "I started with an empty draft. The editor takes focus when I click the blank area, and the caret stays in place as the draft grows to several lines.",
          "A selected phrase opens the formatting menu. I’m checking where that menu lands near either edge of the composer, especially when the selected text wraps onto a second line.",
          "The attachment row shows the file name, type, and remove action. I tried adding a second image and removing the first to check that the remaining preview stays in the same order.",
          "I also checked that the footer controls stay reachable when the editor scrolls. Tabbing through the composer reaches the attachment menu, access picker, model picker, and send button in that order.",
          "The transcript keeps following the latest reply until I scroll up. With the viewport higher in the chat, a new paragraph should leave the part I’m reading in place.",
          "Next I’ll compare the narrow layout and",
        ].join("\n\n"),
      },
    ],
  } satisfies Omit<Example, "id">;
  export const question = {
    turnId: "handout-turn",
    question: "Which format should the handout use?",
    options: [{ label: "Compact" }, { label: "Large print" }],
    progressId: "handout-progress",
    progress:
      "I’m organizing the handout around the three stops on the tour. Each stop will have a short introduction, one image with a caption, and a note about what to look for. I’ll keep the layout flexible until the format is decided.",
  };
  const missingImage: NativeChatMessageAttachment = {
    name: "unavailable-reference.jpg",
    mimeType: "image/jpeg",
    previewId: "local-fixture-missing-image",
  };
  const handoutReviewTurn = "handout-review-turn";
  const reviews = [
    {
      childId: "layout-review",
      name: "Layout review",
      started: 2,
      finished: 8,
      status: "succeeded",
    },
    {
      childId: "copy-review",
      name: "Copy review",
      started: 3,
      finished: 6,
      status: "failed",
    },
    {
      childId: "accessibility-review",
      name: "Accessibility review",
      started: 5,
      finished: 7,
      status: "cancelled",
    },
  ] as const;
  const optionalQuestion = (
    id: string,
    prompt: string,
    options: readonly string[]
  ): NativeChatQuestion => ({
    questionId: id,
    reviewId: id,
    question: prompt,
    options,
    style: "nonblocking",
    expiresWithTurn: true,
  });
  const handoutRequest: NativeChatMessage = {
    messageId: "handout-request",
    role: "user",
    text: "Draft a handout for the gallery tour.",
    turnId: question.turnId,
  };

  const previewCases = [
    {
      id: "preview-two-urls",
      request: "Show me both versions of the gallery.",
      reply:
        "[Light gallery](http://localhost:4173/light) and [dark gallery](http://localhost:4173/dark) are ready.",
    },
    {
      id: "preview-url-label",
      request: "Paste the feedback page address.",
      reply: "[http://localhost:4173/feedback](http://localhost:4173/feedback)",
    },
    {
      id: "preview-unavailable",
      request: "Where was the archived layout?",
      reply: "The [archive preview](http://localhost:4173/archive) was here.",
    },
    {
      id: "preview-fx",
      request: "Where can I review the workflow?",
      reply: "Open the [workflow viewer](http://127.0.0.1:4174/plan).",
    },
    {
      id: "preview-ready",
      request: "Show me the gallery preview.",
      reply: "The [gallery preview](http://localhost:4173/gallery) is ready.",
    },
    {
      id: "preview-running",
      request: "Can I see the print layout, too?",
      reply:
        "The [print preview](http://localhost:4173/print) is ready to review.",
    },
  ];

  const webPreview: Example = {
    id: "web-preview",
    activeTurnId: "preview-running",
    messages: previewCases.flatMap(
      ({ id, request, reply }): NativeChatMessage[] => [
        { messageId: `${id}-user`, role: "user", text: request, turnId: id },
        {
          messageId: `${id}-answer`,
          role: "assistant",
          phase: "answer",
          text: reply,
          turnId: id,
        },
      ]
    ),
    records: previewCases.slice(0, -1).map(({ id }, index) => ({
      turnId: id,
      status: "succeeded",
      startedAtMs: startedAtMs - (previewCases.length - 1 - index) * 60_000,
      settledAtMs:
        startedAtMs - (previewCases.length - 1 - index) * 60_000 + 5200,
    })),
  };

  const scenarios: readonly Example[] = [
    {
      id: "question",
      streamingMessageId: question.progressId,
      messages: [handoutRequest],
      questions: [
        optionalQuestion(
          "handout-question",
          question.question,
          question.options.map(({ label }) => label)
        ),
      ],
    },
    {
      id: "blocking-question",
      messages: [handoutRequest],
      questions: [
        {
          questionId: "print-quantity",
          reviewId: "print-quantity",
          question: "How many copies should the printer prepare?",
          options: [],
          style: "answer_dependent",
        },
      ],
    },
    {
      id: "question-batch",
      messages: [handoutRequest],
      questions: [
        {
          questionId: "handout-batch",
          reviewId: "handout-batch",
          style: "answer_dependent",
          questions: [
            {
              id: "format",
              header: "Format",
              question: question.question,
              options: [
                { label: "Compact", description: "One folded sheet" },
                {
                  label: "Large print",
                  description: "Larger type and more space",
                },
              ],
            },
            {
              id: "map",
              header: "Map",
              question: "Should the map show the accessible entrance?",
              options: [
                { label: "Include it" },
                { label: "Show the tour route only" },
              ],
            },
            {
              id: "copies",
              header: "Copies",
              question: "How many copies should the printer prepare?",
              options: [{ label: "50 copies" }, { label: "100 copies" }],
            },
          ],
        },
      ],
    },
    {
      id: "multiple-questions",
      messages: [handoutRequest],
      questions: [
        optionalQuestion(
          "handout-edition",
          "Which edition of the gallery handout should we prepare for visitors who want to follow the tour independently and keep a reference after their visit?",
          [
            "A folded pocket guide with numbered stops, a small map, and a short caption next to each artwork",
            "A large-print handout with generous spacing, high contrast, and room to write questions during the tour",
            "A bilingual guide with both languages side by side and a map that uses symbols to identify gallery rooms",
            "A family activity sheet with drawing prompts, short explanations, and space for children to record what they notice",
            "A digital edition with clickable exhibit names, longer descriptions, and links to related pieces in the collection",
            "A printer-friendly single sheet with a black-and-white map, a suggested route, and key accessibility information",
          ]
        ),
        optionalQuestion(
          "gallery-map",
          "Should the map include the accessible entrance?",
          ["Include it", "Keep the map focused on the route"]
        ),
        optionalQuestion(
          "gallery-hours",
          "What opening hours should appear on the handout?",
          []
        ),
      ],
    },
    {
      id: "loading",
      messages: [handoutRequest],
    },
    {
      id: "reconnect",
      messages: [handoutRequest],
    },
    {
      id: "approval",
      messages: [
        {
          messageId: "guide-draft",
          role: "user",
          text: "Read the gallery’s printer notes before preparing the handout.",
        },
      ],
    },
    {
      id: "library-request",
      messages: [
        {
          messageId: "guide-reference",
          role: "user",
          text: "Use an image reference for the handout’s cover.",
        },
      ],
    },
    {
      id: "text",
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
      id: "inline-workspace-images",
      messages: [
        {
          messageId: "workspace-image-request",
          role: "user",
          text: "Can you show me the Wind Garden cover here in the chat?",
        },
        {
          messageId: "workspace-image-answer",
          role: "assistant",
          text: [
            "Here’s the current cover from the workspace.",
            `![Wind Garden cover](${encodeURI(workspaceImagePath)})`,
            "The earlier draft was linked here.",
            "![Earlier cover draft](Wind%20Garden.canvas/previews/earlier.webp)",
            "![Dice on Wikimedia Commons](https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png)",
            "![Mountain landscape](https://www.gstatic.com/webp/gallery/1.jpg)",
          ].join("\n\n"),
        },
      ],
    },
    {
      id: "svg-selection",
      messages: [
        {
          messageId: "svg-selection-request",
          role: "user",
          text: "What does the selected text say?",
          svgSelection: true,
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
      id: "subagents",
      records: [
        {
          turnId: handoutReviewTurn,
          status: "succeeded",
          startedAtMs,
          settledAtMs: startedAtMs + 12_000,
        },
      ],
      messages: [
        {
          messageId: "handout-review-request",
          turnId: handoutReviewTurn,
          role: "user",
          text: "Review the gallery handout before it goes to print.",
        },
        {
          messageId: "handout-review-progress",
          turnId: handoutReviewTurn,
          role: "assistant",
          phase: "progress",
          text: "I’ll read the printer notes while the subagents review the handout.",
          activityOrder: 1,
          activity: [
            {
              callId: "read-handout-notes",
              title: "read_file",
              kind: "read",
              outcome: "succeeded",
              input: { path: "handout-notes.md" },
              activityOrder: 4,
            },
          ],
        },
        {
          messageId: "handout-review-answer",
          turnId: handoutReviewTurn,
          role: "assistant",
          phase: "answer",
          text: "The layout review found that the map legend needs more space. I checked the captions myself after the copy review failed. The accessibility review was stopped.",
          activityOrder: 9,
        },
      ],
      subagentActivity: {
        children: reviews.map(({ childId, name, status }) => ({
          childId,
          name,
          status,
          kind: "named",
          section: "done",
        })),
        nextAfterChildId: null,
        counts: { active: 0, done: reviews.length, complete: true },
        observedAtMs: startedAtMs + 12_000,
        events: reviews.flatMap(
          ({ childId, name, started, finished, status }) => {
            const assignment = {
              childId,
              name,
              childTurnId: `${childId}-turn`,
              inputId: `${childId}-request`,
              parentTurnId: handoutReviewTurn,
            };
            return [
              {
                ...assignment,
                eventId: `${childId}-started`,
                kind: "started" as const,
                activityOrder: started,
                atMs: startedAtMs + started * 1_000,
              },
              {
                ...assignment,
                eventId: `${childId}-finished`,
                kind: "finished" as const,
                status,
                activityOrder: finished,
                atMs: startedAtMs + finished * 1_000,
              },
            ];
          }
        ),
        eventsComplete: true,
        orderComplete: true,
      },
    },
    { id: "streaming", ...partialReply },
    {
      id: "compaction",
      messages: [
        {
          messageId: "compaction-user",
          role: "user",
          text: "Let’s use the large-print layout for the gallery handout.",
        },
        {
          messageId: "compaction-assistant",
          role: "assistant",
          text: "I’ll use large print and keep the map on the back.",
        },
      ],
    },
    { id: "paused", ...partialReply },
    webPreview,
    {
      id: "suggested-prompt",
      messages: [
        {
          messageId: "cover-review-user",
          role: "user",
          text: "Review the cover slide.",
        },
        {
          messageId: "cover-review-assistant",
          role: "assistant",
          text: "The title is easy to read. I’d move it away from the edge and give the image a little more space.",
        },
      ],
    },
    { id: "empty", messages: [] },
  ];

  function timeDividers(): Example {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterdayEvening = new Date(today);
    yesterdayEvening.setDate(today.getDate() - 1);
    yesterdayEvening.setHours(23);
    const minute = 60_000;
    const turns = [
      {
        startedAtMs: +yesterdayEvening,
        minutes: 20,
        request: "Draft a tour route for the gallery.",
        answer: "The route starts in the courtyard and ends in the east wing.",
      },
      {
        startedAtMs: +yesterdayEvening + 23 * minute,
        minutes: 4,
        request: "Add a stop in the sculpture room.",
        answer: "Added it between the courtyard and the east wing.",
      },
      {
        startedAtMs: +yesterdayEvening + 45 * minute,
        minutes: 13,
        request: "Can we make a shorter route too?",
        answer: "The short route has two stops, both on the ground floor.",
      },
      {
        startedAtMs: +today,
        minutes: 1,
        request: "Use the short route for the handout.",
        answer: "I’ll use the two-stop route in the handout.",
      },
    ];
    return {
      id: "time-dividers",
      messages: turns.flatMap(({ request, answer }, index) => [
        {
          messageId: `tour-request-${index}`,
          turnId: `tour-turn-${index}`,
          role: "user",
          text: request,
        },
        {
          messageId: `tour-answer-${index}`,
          turnId: `tour-turn-${index}`,
          role: "assistant",
          phase: "answer",
          text: answer,
        },
      ]),
      records: turns.map(({ startedAtMs, minutes }, index) => ({
        turnId: `tour-turn-${index}`,
        status: "succeeded",
        startedAtMs,
        settledAtMs: startedAtMs + minutes * minute,
      })),
    };
  }

  export function get(id: Scenario): Example {
    if (id === "time-dividers") return timeDividers();
    return scenarios.find((example) => example.id === id)!;
  }

  /** Exact fixture token only; unknown tokens exercise the named fallback. */
  export const readImage = DesktopComposerFixtures.readImage;
}
