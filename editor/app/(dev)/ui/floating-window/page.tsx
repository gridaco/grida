"use client";

import {
  FloatingWindowHost,
  FloatingWindowBounds,
  FloatingWindowBody,
  FloatingWindowRoot,
  FloatingWindowTitleBar,
  FloatingWindowClose,
  FloatingWindowTrigger,
} from "@/components/floating-window";
import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  IconsBrowser,
  type IconsBrowserItem,
} from "@/grida-canvas-hosted/library/icons-browser";
import { PhotosBrowser } from "@/grida-canvas-hosted/library/photos-browser";
import { toast } from "sonner";

function InspectorExample() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error("Inspector example crashed (test error boundary)");
  }

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>Use this window to show properties.</p>
      <ul className="list-disc list-inside space-y-1">
        <li>Drag handle wired via render-prop.</li>
        <li>Transform driven by CSS vars.</li>
        <li>Boundary clamps motion.</li>
      </ul>
      <div className="pt-2">
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs text-foreground hover:bg-muted"
          onClick={() => setShouldThrow(true)}
        >
          Throw error
        </button>
      </div>
    </div>
  );
}

export default function FloatingWindowDemoPage() {
  const handleIconInsert = useCallback((icon: IconsBrowserItem) => {
    toast.success(`Selected ${icon.name}`);
  }, []);

  const handlePhotoInsert = useCallback((photo: { alt?: string }) => {
    toast.success(`Selected ${photo.alt || "Photo"}`);
  }, []);

  const iconsPane = useMemo(
    () => <IconsBrowser onInsert={handleIconInsert} />,
    [handleIconInsert]
  );

  const photosPane = useMemo(
    () => <PhotosBrowser onInsert={handlePhotoInsert} />,
    [handlePhotoInsert]
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Floating Window
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Drag windows by the title bar. The dashed area below is the boundary
          element — windows are clamped inside it. Position is applied via CSS
          variables and GPU-friendly transforms to avoid reflow.
        </p>
      </header>

      <section className="rounded-lg border bg-card overflow-hidden">
        <FloatingWindowHost>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b text-sm">
            <span className="mr-auto text-xs text-muted-foreground">
              Open windows:
            </span>
            <FloatingWindowTrigger
              windowId="inspector"
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Inspector
            </FloatingWindowTrigger>
            <FloatingWindowTrigger
              windowId="console"
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Console
            </FloatingWindowTrigger>
            <FloatingWindowTrigger
              windowId="icons"
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Icons Browser
            </FloatingWindowTrigger>
            <FloatingWindowTrigger
              windowId="photos"
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Photos Browser
            </FloatingWindowTrigger>
          </div>

          <FloatingWindowBounds className="h-[640px] bg-muted/30 [background-image:radial-gradient(theme(colors.border)_1px,transparent_1px)] [background-size:16px_16px] border-t border-dashed">
            {({ boundaryEl }) => (
              <>
                <FloatingWindowRoot
                  windowId="inspector"
                  boundaryEl={boundaryEl}
                  initialX={24}
                  initialY={24}
                  width={320}
                  render={({ dragHandleProps, controls }) => (
                    <>
                      <FloatingWindowTitleBar dragHandleProps={dragHandleProps}>
                        <span className="font-medium">Inspector</span>
                        <FloatingWindowClose
                          windowId="inspector"
                          controls={controls}
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Close</span>
                        </FloatingWindowClose>
                      </FloatingWindowTitleBar>
                      <FloatingWindowBody>
                        <InspectorExample />
                      </FloatingWindowBody>
                    </>
                  )}
                />

                <FloatingWindowRoot
                  windowId="console"
                  boundaryEl={boundaryEl}
                  initialX={24}
                  initialY={300}
                  width={320}
                  render={({ dragHandleProps, controls }) => (
                    <>
                      <FloatingWindowTitleBar dragHandleProps={dragHandleProps}>
                        <span className="font-medium">Console</span>
                        <FloatingWindowClose
                          windowId="console"
                          controls={controls}
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Close</span>
                        </FloatingWindowClose>
                      </FloatingWindowTitleBar>
                      <FloatingWindowBody className="font-mono text-xs space-y-2">
                        <p className="text-muted-foreground">
                          Drag me independently; no shared context required.
                        </p>
                        <div className="rounded-md bg-slate-950 text-slate-100 p-3">
                          <div>$ window.moveTo(x, y)</div>
                          <div className="text-slate-400">{"// logs"}</div>
                          <div>{"Ready >"}</div>
                        </div>
                      </FloatingWindowBody>
                    </>
                  )}
                />

                <FloatingWindowRoot
                  windowId="icons"
                  boundaryEl={boundaryEl}
                  initialX={360}
                  initialY={24}
                  width={340}
                  height={300}
                  className="flex flex-col overflow-hidden"
                  render={({ dragHandleProps, controls }) => (
                    <>
                      <FloatingWindowTitleBar dragHandleProps={dragHandleProps}>
                        <span className="font-medium">Icons Browser</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          icons.grida.co
                        </span>
                        <FloatingWindowClose
                          windowId="icons"
                          controls={controls}
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Close</span>
                        </FloatingWindowClose>
                      </FloatingWindowTitleBar>
                      <FloatingWindowBody className="text-sm p-0 flex-1 flex flex-col overflow-hidden">
                        {iconsPane}
                      </FloatingWindowBody>
                    </>
                  )}
                />

                <FloatingWindowRoot
                  windowId="photos"
                  boundaryEl={boundaryEl}
                  initialX={360}
                  initialY={336}
                  width={340}
                  height={300}
                  className="flex flex-col overflow-hidden"
                  render={({ dragHandleProps, controls }) => (
                    <>
                      <FloatingWindowTitleBar dragHandleProps={dragHandleProps}>
                        <span className="font-medium">Photos Browser</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          Unsplash
                        </span>
                        <FloatingWindowClose
                          windowId="photos"
                          controls={controls}
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Close</span>
                        </FloatingWindowClose>
                      </FloatingWindowTitleBar>
                      <FloatingWindowBody className="text-sm p-0 flex-1 flex flex-col overflow-hidden">
                        {photosPane}
                      </FloatingWindowBody>
                    </>
                  )}
                />
              </>
            )}
          </FloatingWindowBounds>
        </FloatingWindowHost>
      </section>
    </main>
  );
}
