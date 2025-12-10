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
import { X } from "lucide-react";

export default function FloatingWindowDemoPage() {
  return (
    <main className="min-h-screen bg-slate-50/60 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">
            Floating window primitives (no context)
          </p>
          <h1 className="text-2xl font-semibold">Floating Window Demo</h1>
          <p className="text-sm text-muted-foreground">
            Drag windows by the title bar. Boundaries are enforced by the
            containing element. Position is applied via CSS variables and
            GPU-friendly transforms to avoid reflow.
          </p>
        </header>

        <section className="aspect-video rounded-xl border bg-white shadow-sm">
          <FloatingWindowHost>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-b">
              <FloatingWindowTrigger
                windowId="inspector"
                className="text-sm text-primary hover:underline"
              >
                Open Inspector
              </FloatingWindowTrigger>
              <FloatingWindowTrigger
                windowId="console"
                className="text-sm text-primary hover:underline"
              >
                Open Console
              </FloatingWindowTrigger>
              <FloatingWindowTrigger
                windowId="emoji"
                className="text-sm text-primary hover:underline"
              >
                Open Emoji
              </FloatingWindowTrigger>
            </div>
            <FloatingWindowBounds>
              {({ boundaryRef }) => (
                <>
                  <FloatingWindowRoot
                    windowId="inspector"
                    boundaryRef={boundaryRef}
                    initialX={24}
                    initialY={24}
                    width={340}
                    render={({ dragHandleProps, controls }) => (
                      <>
                        <FloatingWindowTitleBar
                          dragHandleProps={dragHandleProps}
                        >
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
                        <FloatingWindowBody className="space-y-2 text-sm text-muted-foreground">
                          <p>Use this window to show properties.</p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>Drag handle wired via render-prop.</li>
                            <li>Transform driven by CSS vars.</li>
                            <li>Boundary clamps motion.</li>
                          </ul>
                        </FloatingWindowBody>
                      </>
                    )}
                  />

                  <FloatingWindowRoot
                    windowId="console"
                    boundaryRef={boundaryRef}
                    initialX={180}
                    initialY={140}
                    width={360}
                    render={({ dragHandleProps, controls }) => (
                      <>
                        <FloatingWindowTitleBar
                          dragHandleProps={dragHandleProps}
                        >
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
                            <div className="text-slate-400">// logs</div>
                            <div>{"Ready >"}</div>
                          </div>
                        </FloatingWindowBody>
                      </>
                    )}
                  />

                  <FloatingWindowRoot
                    windowId="emoji"
                    boundaryRef={boundaryRef}
                    initialX={320}
                    initialY={80}
                    width={320}
                    height={280}
                    render={({ dragHandleProps, controls }) => (
                      <>
                        <FloatingWindowTitleBar
                          dragHandleProps={dragHandleProps}
                        >
                          <span className="font-medium">Emoji Search</span>
                          <FloatingWindowClose
                            windowId="emoji"
                            controls={controls}
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" aria-hidden />
                            <span className="sr-only">Close</span>
                          </FloatingWindowClose>
                        </FloatingWindowTitleBar>
                        <FloatingWindowBody className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <input
                              placeholder="Search emoji"
                              className="w-full rounded-md border px-2 py-1 text-sm"
                            />
                            <span className="text-xs text-muted-foreground">
                              ⌘K
                            </span>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-auto">
                            {[
                              "😀 Grinning",
                              "😎 Cool",
                              "🤣 ROFL",
                              "😍 Heart Eyes",
                              "🤔 Thinking",
                              "🔥 Fire",
                              "✨ Sparkles",
                              "🎉 Party Popper",
                              "✅ Check",
                              "❌ Cross",
                              "👍 Thumbs Up",
                              "🙏 Thanks",
                              "🚀 Rocket",
                              "🌙 Moon",
                              "⭐ Star",
                              "🍕 Pizza",
                              "🍔 Burger",
                              "☕ Coffee",
                              "💡 Idea",
                              "🔍 Search",
                            ].map((label) => (
                              <button
                                key={label}
                                className="w-full text-left px-2 py-1 rounded-md hover:bg-muted transition"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </FloatingWindowBody>
                      </>
                    )}
                  />
                </>
              )}
            </FloatingWindowBounds>
          </FloatingWindowHost>
        </section>
      </div>
    </main>
  );
}
