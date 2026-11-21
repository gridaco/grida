"use client";

import { Button } from "@app/ui/components/button";
import { ScrollBar } from "@app/ui/components/scroll-area";
import { cn } from "@app/ui/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

/** The conversation's scroll state, for content that needs its scroll element. */
export const useConversationContext = useStickToBottomContext;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
> & {
  scrollbar?: "native" | "custom";
};

export const ConversationContent = ({
  className,
  scrollbar = "native",
  ...props
}: ConversationContentProps) =>
  scrollbar === "custom" ? (
    <ConversationScrollAreaContent className={className} {...props} />
  ) : (
    <StickToBottom.Content
      className={cn("flex flex-col gap-8 p-4", className)}
      {...props}
    />
  );

const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
]);

function ConversationScrollAreaContent({
  className,
  scrollClassName,
  children,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  const context = useStickToBottomContext();
  const [scrollbarActive, setScrollbarActive] = useState(false);
  const hideScrollbar = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(hideScrollbar.current), []);

  function revealScrollbar() {
    setScrollbarActive(true);
    window.clearTimeout(hideScrollbar.current);
    hideScrollbar.current = window.setTimeout(
      () => setScrollbarActive(false),
      800
    );
  }

  return (
    <ScrollAreaPrimitive.Root
      type="auto"
      className="relative h-full min-h-0 min-w-0"
    >
      {/* Share one native viewport. Radix's table wrapper measures horizontal
          overflow; a vertical-only transcript needs block layout to wrap.
          The wheel escape reads computed overflow, so keep both axes equal. */}
      <ScrollAreaPrimitive.Viewport
        ref={context.scrollRef}
        style={{ overflowX: "scroll", overflowY: "scroll" }}
        className={cn("size-full [&>div]:!block", scrollClassName)}
        data-slot="scroll-area-viewport"
        tabIndex={0}
        onWheel={(event) => {
          if (event.deltaY && !event.ctrlKey && !event.defaultPrevented) {
            revealScrollbar();
          }
        }}
        onTouchMove={revealScrollbar}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            !event.defaultPrevented &&
            SCROLL_KEYS.has(event.key)
          ) {
            revealScrollbar();
          }
        }}
      >
        <div
          {...props}
          ref={context.contentRef}
          className={cn("flex flex-col gap-8 p-4", className)}
        >
          {typeof children === "function" ? children(context) : children}
        </div>
      </ScrollAreaPrimitive.Viewport>
      {/* Radix handles overflow and dragging. User input controls visibility
          because streaming autoscroll also emits native scroll events. */}
      <ScrollBar
        data-scroll-active={scrollbarActive ? "" : undefined}
        className="pointer-events-none z-10 w-2.5 border-0 bg-transparent p-0.5 opacity-0 transition-opacity duration-200 hover:pointer-events-auto hover:opacity-100 active:pointer-events-auto active:opacity-100 motion-reduce:transition-none data-[scroll-active]:pointer-events-auto data-[scroll-active]:opacity-100 [&_[data-slot=scroll-area-thumb]]:bg-foreground/35 [&_[data-slot=scroll-area-thumb]]:transition-[scale] [&_[data-slot=scroll-area-thumb]]:duration-150 [&_[data-slot=scroll-area-thumb]]:ease-out [&:hover_[data-slot=scroll-area-thumb]]:scale-x-125 motion-reduce:[&_[data-slot=scroll-area-thumb]]:transition-none"
      />
    </ScrollAreaPrimitive.Root>
  );
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
