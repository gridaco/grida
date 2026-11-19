import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { NativeChatReadState } from "@grida/desktop-bridge";
import type { NativeChatController } from "@/lib/agent-chat/native-chat-controller";

/** A catalog read receipt is tied to the reply actually drawn in this pane. */
export function NativeDisplayedReply({
  controller,
  sessionId,
  readState,
  presented,
  pane,
  message,
  historyLoaded,
}: {
  controller: NativeChatController;
  sessionId: string;
  readState: NativeChatReadState;
  pane: RefObject<HTMLDivElement | null>;
  presented: boolean;
  message: HTMLDivElement | null;
  historyLoaded: boolean;
}) {
  const displayed = useRef(readState);
  useLayoutEffect(() => {
    displayed.current = readState;
  }, [readState]);
  useEffect(() => {
    if (!presented || !pane.current) return;
    // Mark unread before a tracked reply exists refers to the whole chat.
    // Wait until the history read finishes, including for an empty chat.
    const target =
      readState.replyId === null && historyLoaded ? pane.current : message;
    if (!target) return;
    return observeDisplayedReply(target, pane.current, () => {
      const { unread, replyId, revision } = displayed.current;
      if (unread)
        void controller.acknowledgeReply(sessionId, replyId, revision);
    });
  }, [
    controller,
    sessionId,
    readState.replyId,
    historyLoaded,
    presented,
    pane,
    message,
  ]);
  return null;
}

/** A manual unread change while the same reply stays on screen is preserved. */
function observeDisplayedReply(
  node: Element,
  pane: Element,
  onView: () => void
) {
  const doc = node.ownerDocument;
  const window = doc.defaultView;
  if (!window) return;
  let focused =
    pane.contains(doc.activeElement) && !doc.activeElement?.closest("header");
  let intersects = false;
  let seen = false;
  let active = true;
  function check() {
    const visible = active && intersects && !doc.hidden && doc.hasFocus();
    if (visible && focused && !seen) {
      seen = true;
      onView();
    } else if (!visible) {
      seen = false;
    }
  }
  function interaction(event: Event) {
    const target = event.target;
    if (!(target instanceof Element) || target === doc.body) return;
    // A picker or options menu temporarily has focus. Dismissing it with the
    // same reply still in view must preserve an explicit Mark unread.
    if (target.closest("header, [role=menu], [role=dialog], [role=listbox]")) {
      focused = false;
      return;
    }
    focused = pane.contains(target);
    if (!focused) seen = false;
    check();
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      intersects = entry.isIntersecting && entry.intersectionRect.height > 0;
      check();
    }
  });
  observer.observe(node);
  doc.addEventListener("focusin", interaction);
  doc.addEventListener("pointerdown", interaction);
  doc.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
  window.addEventListener("blur", check);
  return () => {
    active = false;
    observer.disconnect();
    doc.removeEventListener("focusin", interaction);
    doc.removeEventListener("pointerdown", interaction);
    doc.removeEventListener("visibilitychange", check);
    window.removeEventListener("focus", check);
    window.removeEventListener("blur", check);
  };
}
