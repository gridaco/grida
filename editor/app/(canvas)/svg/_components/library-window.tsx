"use client";

import { memo, useCallback } from "react";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import {
  FloatingWindowBody,
  FloatingWindowClose,
  FloatingWindowRoot,
  FloatingWindowTitleBar,
  FloatingWindowTrigger,
  useFloatingWindowControls,
} from "@/components/floating-window";
import { Button } from "@app/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import {
  IconsBrowser,
  type IconsBrowserItem,
} from "@/grida-canvas-hosted/library/icons-browser";
import { datatransfer } from "@/grida-canvas/data-transfer";

/**
 * "Library" — the icons.grida.co browser, floating-window edition for the
 * SVG demo routes. Same browser component the main canvas playground
 * mounts. Pure chrome: both insertion paths hand the host an asset URL —
 * click via `onInsertSrc`, drag via the shared `x-grida-data-transfer`
 * payload — and the host owns fetch, placement, and feedback.
 *
 * Memoized: the host page re-renders on every persisted edit; with a
 * stable `onInsertSrc` the open window (virtualized icon grid included)
 * skips those re-renders entirely.
 */
export const SvgLibraryWindow = memo(function SvgLibraryWindow({
  onInsertSrc,
}: {
  /** Insert the asset at `src` into the document (click-to-insert path). */
  onInsertSrc: (src: string) => void;
}) {
  const controls = useFloatingWindowControls({ defaultOpen: false });

  const handleInsertIcon = useCallback(
    (icon: IconsBrowserItem) => onInsertSrc(icon.download),
    [onInsertSrc]
  );

  const handleIconDragStart = useCallback(
    (icon: IconsBrowserItem, event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        datatransfer.key,
        datatransfer.encode({
          type: "svg",
          name: icon.name,
          src: icon.download,
        })
      );
    },
    []
  );

  return (
    <>
      <div className="absolute top-4 left-4 z-50">
        <Tooltip>
          <FloatingWindowTrigger
            windowId="svg-library"
            controls={controls}
            asChild
          >
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="size-8 rounded-full p-0"
                aria-label="Open Library"
              >
                <PlusIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
          </FloatingWindowTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Open Library
          </TooltipContent>
        </Tooltip>
      </div>
      <FloatingWindowRoot
        windowId="svg-library"
        controls={controls}
        initialX={64}
        initialY={120}
        width={360}
        height={560}
        className="z-[999] rounded-xl shadow-xl max-w-[calc(100vw-3rem)] max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden"
        render={({ dragHandleProps, controls: c }) => (
          <>
            <FloatingWindowTitleBar
              dragHandleProps={dragHandleProps}
              className="bg-background"
            >
              <span className="font-medium text-sm">Library</span>
              <FloatingWindowClose
                windowId="svg-library"
                controls={c}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                <Cross1Icon className="size-4" aria-hidden />
                <span className="sr-only">Close</span>
              </FloatingWindowClose>
            </FloatingWindowTitleBar>
            <FloatingWindowBody className="p-0 text-sm h-full flex flex-col overflow-hidden">
              <IconsBrowser
                onInsert={handleInsertIcon}
                onDragStart={handleIconDragStart}
              />
            </FloatingWindowBody>
          </>
        )}
      />
    </>
  );
});
