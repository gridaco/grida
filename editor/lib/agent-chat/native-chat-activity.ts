import type { NativeChatView } from "./native-chat-controller";

/** Running work and a request for input can coexist on one turn. */
export type ChatActivity = Readonly<{ running: boolean; inputNeeded: boolean }>;

/** Observe an already-attached chat. Older hosts expose individual requests. */
export function attachedChatActivity(view: NativeChatView): ChatActivity {
  const turn = view.connectionRecovery
    ? null
    : view.observation?.snapshot.current;
  return {
    running: turn?.disposition === "running",
    inputNeeded:
      !!turn &&
      !turn.cancelled &&
      (turn.inputNeeded ??
        (view.questions.length > 0 ||
          view.approvals.length > 0 ||
          !!view.librarySelection)),
  };
}

/** Only this frame's side chats contribute to their selected parent's status. */
export function chatActivity(
  view: NativeChatView,
  listedId?: string
): ChatActivity {
  const listedRunning =
    listedId === undefined
      ? undefined
      : view.runningSessionIds?.includes(listedId);
  const listedInput =
    listedId === undefined
      ? undefined
      : view.inputNeededSessionIds?.includes(listedId);
  if (listedId !== undefined && listedId !== view.selected)
    return {
      running: listedRunning ?? false,
      inputNeeded: listedInput ?? false,
    };
  const own = attachedChatActivity(view);
  let running = listedRunning ?? own.running;
  let inputNeeded = listedInput ?? own.inputNeeded;
  for (const { chat } of view.sideChats) {
    const side = attachedChatActivity(chat.read());
    running ||= side.running;
    inputNeeded ||= side.inputNeeded;
  }
  return { running, inputNeeded };
}
