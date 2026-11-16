import type {
  NativeChatObservation,
  NativeChatBackgroundProcess,
  NativeSubagentActivityPage,
  NativeSubagentClient,
  NativeSubagentConversation,
  NativeSubagentObservation,
} from "@grida/desktop-bridge";
import { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";
import { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";

/** Synthetic, provider-free inputs shared by activity rendering and navigation tests. */
export namespace NativeActivityFixtures {
  export const now = Date.UTC(2026, 0, 2, 12);

  export function conversation(
    childId: string,
    live = false
  ): NativeSubagentConversation {
    return {
      childId,
      name: childId === "working-child" ? "Researcher" : "Reviewer",
      kind: "named",
      view: 1,
      messages: [
        {
          messageId: `${childId}-request`,
          role: "user",
          text: "Compare the two approaches.",
          turnId: `${childId}-turn`,
        },
        {
          messageId: `${childId}-${live ? "live" : "answer"}`,
          role: "assistant",
          text: live
            ? "I am comparing the evidence."
            : "The second approach preserves the contract.",
          turnId: `${childId}-turn`,
          phase: live ? "progress" : "answer",
          ...(live && { live: true as const }),
        },
      ],
      turns: [
        {
          turnId: `${childId}-turn`,
          status: live ? null : "succeeded",
          startedAtMs: now - 300_000,
          ...(!live && { settledAtMs: now - 60_000 }),
          execution: { model: "captured-model", effort: "high" },
        },
      ],
      execution: { model: "captured-model", effort: "high" },
      older: null,
      live: { available: true, truncated: false },
      observedAtMs: now,
    };
  }

  export async function create(modern = true) {
    const parent: NativeChatObservation = {
      observationId: "parent-observation",
      snapshot: {
        sessionId: "parent-chat",
        sessionRevision: 2,
        queuedInputs: 0,
        admissionPaused: false,
        current: null,
        subagentsAvailable: true,
        ...(modern && { subagentActivityAvailable: true as const }),
        latest: {
          turnId: "parent-turn",
          epoch: 1,
          historyPosition: 1,
          journalPosition: 1,
          controlRevision: 0,
          paused: false,
          cancelled: false,
          disposition: "settled",
          status: "succeeded",
        },
      },
    };
    const data = {
      activity: {
        children: [
          {
            childId: "working-child",
            name: "Researcher",
            kind: "named",
            status: "running",
            section: "active",
            updatedAtMs: now - 120_000,
            latestTurnId: "working-child-turn",
          },
          {
            childId: "done-child",
            name: "Reviewer",
            kind: "named",
            status: "succeeded",
            section: "done",
            updatedAtMs: now - 60_000,
            latestTurnId: "done-child-turn",
          },
        ],
        nextAfterChildId: null,
        counts: { active: 1, done: 1, complete: true },
        observedAtMs: now,
        events: [
          {
            eventId: "review-start",
            childId: "done-child",
            name: "Reviewer",
            kind: "started",
            childTurnId: "done-child-turn",
            parentTurnId: "parent-turn",
            inputId: "done-input",
            atMs: now - 300_000,
          },
          {
            eventId: "review-finish",
            childId: "done-child",
            name: "Reviewer",
            kind: "finished",
            childTurnId: "done-child-turn",
            parentTurnId: "parent-turn",
            inputId: "done-input",
            atMs: now - 60_000,
            status: "succeeded",
          },
        ],
        eventsComplete: true,
      } as NativeSubagentActivityPage,
      conversations: new Map<string, NativeSubagentConversation>([
        ["working-child", conversation("working-child", true)],
        ["done-child", conversation("done-child")],
      ]),
      processes: [
        {
          processId: 1,
          command: "pnpm dev",
          cwd: "/workspace/project",
          terminal: false,
          startedAt: now - 300_000,
          state: "running",
          exitCode: null,
        },
        {
          processId: 2,
          command: "pnpm test",
          cwd: "/workspace/project",
          terminal: false,
          startedAt: now - 300_000,
          state: "ended",
          exitCode: 0,
        },
      ] as readonly NativeChatBackgroundProcess[],
      inspection: (childId: string): NativeSubagentObservation => {
        const current = data.conversations
          .get(childId)
          ?.messages.some((message) => message.live)
          ? {
              turnId: `${childId}-turn`,
              disposition: "running" as const,
              status: null,
              paused: false,
              cancelled: false,
            }
          : null;
        return {
          child: {
            childId,
            name:
              data.activity.children.find((child) => child.childId === childId)
                ?.name ?? childId,
            workTurns: 2,
            reserved: 1,
            admissionPaused: false,
            queuedInputIds: [],
            current,
            assignment: {
              inputId: `${childId}-input`,
              parentTurnId: "parent-turn",
              instructionPreview: "Compare the two approaches.",
              instructionTruncated: false,
              disposition: current ? "claimed" : "completed",
              turn: current ?? {
                turnId: `${childId}-turn`,
                disposition: "settled",
                status: "succeeded",
                paused: false,
                cancelled: false,
              },
              result: current
                ? null
                : {
                    turnId: `${childId}-turn`,
                    status: "succeeded",
                    text: "A bounded result preview.",
                    textTruncated: false,
                  },
            },
          },
          stopObservationId: current ? `${childId}-token` : null,
          turnControls: current ? ["pause", "steer"] : [],
          childControls: {
            observationId: `${childId}-controls`,
            available: ["message"],
          },
        };
      },
    };
    const calls = {
      activity: [] as (string | undefined)[],
      conversations: [] as { childId: string; before?: string }[],
      inspect: [] as string[],
      stop: [] as string[],
      turn: [] as unknown[],
      child: [] as unknown[],
      processStop: [] as (readonly number[] | undefined)[],
    };
    const client: NativeSubagentClient = {
      subagentActivity: async (_attachment, after) => {
        calls.activity.push(after);
        return data.activity;
      },
      subagentConversation: async (_attachment, childId, before) => {
        calls.conversations.push({ childId, before });
        const page = data.conversations.get(childId);
        if (!page) throw new Error("subagent_not_found");
        return page;
      },
      listSubagents: async () => ({
        children: data.activity.children,
        nextAfterChildId: data.activity.nextAfterChildId,
      }),
      inspectSubagent: async (_attachment, childId) => {
        calls.inspect.push(childId);
        return data.inspection(childId);
      },
      createSubagent: async (_attachment, input) => ({
        childId: "created-child",
        name: input.name,
      }),
      assignSubagent: async (_attachment, input) => ({
        inputId: input.inputId,
        parentTurnId: "parent-turn",
        instructionPreview: input.instructions,
        instructionTruncated: false,
        disposition: "queued",
        turn: null,
        result: null,
      }),
      stopSubagent: async (_attachment, token) => {
        calls.stop.push(token);
      },
      controlSubagentTurn: async (_attachment, ...input) => {
        calls.turn.push(input);
      },
      controlSubagentChild: async (_attachment, ...input) => {
        calls.child.push(input);
      },
    };
    const controller = new NativeSubagentController(
      client,
      "parent-attachment",
      () => parent
    );
    const processes = new NativeBackgroundProcessController(
      {
        acceptsBackgroundProcesses: async () => true,
        backgroundProcesses: async () => data.processes,
        stopBackgroundProcesses: async (_attachment, ids) => {
          calls.processStop.push(ids);
          data.processes = data.processes.map((process) =>
            !ids || ids.includes(process.processId)
              ? { ...process, state: "ended", exitCode: 0 }
              : process
          );
          return ids ?? data.processes.map((process) => process.processId);
        },
      },
      "parent-attachment"
    );
    processes.receive(data.processes);
    controller.parentUpdated();
    await Promise.resolve();
    return {
      controller,
      processes,
      client,
      parent,
      data,
      calls,
      dispose: () => {
        controller.dispose();
        processes.dispose();
      },
    };
  }
}
