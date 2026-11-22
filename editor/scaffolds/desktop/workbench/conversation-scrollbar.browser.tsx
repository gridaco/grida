import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  Conversation,
  ConversationContent,
  type ConversationProps,
} from "@app/ui/ai-elements/conversation";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import "@/app/ui.css";
import layout from "./native-chat-layout.module.css";
import workbench from "./workspace-workbench.module.css";

let root: Root;
afterEach(() => {
  flushSync(() => root?.unmount());
  document.body.replaceChildren();
});

it("follows the transcript quietly and reveals the scrollbar during manual scrolling", async () => {
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
  expect(getComputedStyle(viewport).overflow).toBe("scroll");
  await expect.poll(atBottom).toBe(true);

  const scrollbar = () =>
    container.querySelector<HTMLElement>("[data-slot=scroll-area-scrollbar]");
  const scrollbarInteractive = () => {
    const bar = scrollbar();
    return bar !== null && getComputedStyle(bar).pointerEvents !== "none";
  };

  // Growing streamed content follows the bottom without revealing the thumb.
  render(1500);
  await expect.poll(atBottom).toBe(true);
  expect(scrollbarInteractive()).toBe(false);

  // Upward wheel intent escapes even before a scroll event, while streamed
  // growth can cause the library to ignore scroll events during resize.
  render(1800);
  flushSync(() => {
    viewport.firstElementChild!.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -400, bubbles: true })
    );
  });
  await expect.poll(() => contextRef.current?.isAtBottom).toBe(false);
  // Synthetic wheel events have no browser default scrolling action.
  viewport.scrollTop -= 400;
  const previousTop = viewport.scrollTop;
  render(2100);
  await expect.poll(() => viewport.scrollHeight).toBeGreaterThan(2100);
  expect(viewport.scrollTop).toBe(previousTop);
  await expect.poll(scrollbarInteractive).toBe(true);
  expect(getComputedStyle(scrollbar()!).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)"
  );
  await expect.poll(scrollbarInteractive, { timeout: 3000 }).toBe(false);
});

it("keeps the edge scrollbar and workspace divider independently draggable", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root.render(
      <div className={workbench.workbench} style={{ width: 800, height: 240 }}>
        <ResizablePanelGroup resizeTargetMinimumSize={{ fine: 10, coarse: 10 }}>
          <ResizablePanel defaultSize="50%" className={workbench.chatPane}>
            <Conversation className="h-full" initial="instant" resize="instant">
              <ConversationContent
                scrollbar="custom"
                className={layout.contentInset}
                scrollClassName="desktop-native-drag-scroll-viewport"
              >
                <div className="h-[1200px] shrink-0">Transcript</div>
              </ConversationContent>
            </Conversation>
          </ResizablePanel>
          <ResizableHandle className={`z-20 ${workbench.chatSeparator}`} />
          <ResizablePanel>Editor</ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  );
  const viewport = container.querySelector<HTMLElement>(
    "[data-radix-scroll-area-viewport]"
  )!;
  const divider = container.querySelector<HTMLElement>("[role=separator]")!;
  const frame = divider.nextElementSibling as HTMLElement;
  const track = () =>
    container.querySelector<HTMLElement>("[data-slot=scroll-area-scrollbar]");
  const thumb = () =>
    track()?.querySelector<HTMLElement>("[data-slot=scroll-area-thumb]") ??
    null;

  await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0);
  await expect.poll(thumb).not.toBeNull();
  expect(divider.getBoundingClientRect().width).toBe(20);
  expect(getComputedStyle(track()!).pointerEvents).toBe("none");
  expect(track()!.getBoundingClientRect().right).toBe(
    frame.getBoundingClientRect().left
  );

  const width = viewport.clientWidth;
  const initialTop = viewport.scrollTop;
  viewport.dispatchEvent(
    new WheelEvent("wheel", { deltaY: -20, bubbles: true })
  );
  await expect.poll(() => Number(getComputedStyle(track()!).zIndex)).toBe(30);
  expect(divider.getBoundingClientRect().right).toBe(
    track()!.getBoundingClientRect().left
  );
  await userEvent.dragAndDrop(thumb()!, viewport, {
    targetPosition: { x: width - 5, y: 30 },
  });
  expect(viewport.scrollTop).toBeLessThan(initialTop);
  expect(viewport.clientWidth).toBe(width);

  await userEvent.hover(frame);
  await expect.poll(() => divider.getBoundingClientRect().width).toBe(20);
  expect(getComputedStyle(track()!).pointerEvents).toBe("none");
  await userEvent.dragAndDrop(divider, frame, {
    targetPosition: { x: 40, y: 90 },
  });
  expect(viewport.clientWidth).toBeGreaterThan(width);
});
