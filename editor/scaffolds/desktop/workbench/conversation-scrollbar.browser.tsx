import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import {
  Conversation,
  ConversationContent,
  type ConversationProps,
} from "@app/ui/ai-elements/conversation";
import "@/app/ui.css";

let root: Root;
afterEach(() => {
  flushSync(() => root?.unmount());
  document.body.replaceChildren();
});

it("shares the native viewport with autoscroll and fades only the overlay scrollbar", async () => {
  // Exercise real browser scroll/resize events and timers, outside React act.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const contextRef: NonNullable<ConversationProps["contextRef"]> = {
    current: null,
  };
  const render = (height: number) =>
    flushSync(() =>
      root.render(
        <Conversation
          style={{ height: 240, width: 400, flex: "none" }}
          initial="instant"
          resize="instant"
          contextRef={contextRef}
        >
          <ConversationContent scrollbar="custom">
            <div style={{ height, flexShrink: 0 }}>Transcript</div>
          </ConversationContent>
        </Conversation>
      )
    );
  render(1200);
  const viewport = container.querySelector<HTMLElement>(
    "[data-radix-scroll-area-viewport]"
  )!;
  const atBottom = () =>
    Math.abs(
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
    ) < 2;
  expect(contextRef.current?.scrollRef.current).toBe(viewport);
  expect(getComputedStyle(viewport).scrollbarWidth).toBe("none");
  await expect.poll(atBottom).toBe(true);

  // Growing streamed content follows the bottom on that same viewport.
  render(1500);
  await expect.poll(atBottom).toBe(true);
  const scrollbar = () =>
    container.querySelector<HTMLElement>("[data-slot=scroll-area-scrollbar]");
  await expect.poll(() => scrollbar()?.dataset.state).toBe("visible");
  expect(getComputedStyle(scrollbar()!).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)"
  );
  expect(getComputedStyle(scrollbar()!).animationName).not.toBe("none");
  await expect.poll(() => scrollbar(), { timeout: 3000 }).toBeNull();

  // User scrolling up breaks the bottom lock; later streaming must respect it.
  flushSync(() => {
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -400 }));
    viewport.scrollTop -= 400;
  });
  await expect.poll(() => contextRef.current?.isAtBottom).toBe(false);
  const previousTop = viewport.scrollTop;
  render(1800);
  await expect.poll(() => viewport.scrollHeight).toBeGreaterThan(1800);
  expect(viewport.scrollTop).toBe(previousTop);
  await expect.poll(() => scrollbar()?.dataset.state).toBe("visible");
});
