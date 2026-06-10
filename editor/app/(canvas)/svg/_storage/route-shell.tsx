"use client";

import { useSyncExternalStore, type PropsWithChildren } from "react";
import { SvgEditorProvider } from "@grida/svg-editor/react";
import type { Providers } from "@grida/svg-editor";
import {
  FloatingWindowBounds,
  FloatingWindowHost,
} from "@/components/floating-window";
import { AISvgChatProvider } from "../_ai/provider";
import { AISvgChatPanel } from "../_ai/panel";
import { SvgDocStoreProvider, useSvgDocStore } from "./context";
import { EditorBindingEffect } from "./editor-binding-effect";

/**
 * One-stop scaffold for an SVG demo route: store + keyed editor provider
 * + AI chat + floating panel + editor↔store binding. Each route just
 * renders its page body as `children`.
 *
 * **Layering matters.** `AISvgChatProvider` + `<AISvgChatPanel>` sit ABOVE
 * the keyed `<SvgEditorProvider>` so the chat session (messages, in-flight
 * stream, scroll position, draft input) survives across active-doc
 * switches. The agent talks to the doc-store's `AgentFs`, which is stable
 * for the route's lifetime — it doesn't need to be torn down when the
 * user picks a different document. Only the editor + its binding effect
 * remount on `activeId` change.
 */
export function SvgRouteShell({
  opfsBase,
  defaultSvg,
  children,
}: PropsWithChildren<{
  opfsBase: readonly string[];
  defaultSvg: string;
}>) {
  return (
    <SvgDocStoreProvider opfsBase={opfsBase} defaultSvg={defaultSvg}>
      <AISvgChatProvider>
        <FloatingWindowHost>
          <FloatingWindowBounds
            style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
          >
            {({ boundaryRef }) => <AISvgChatPanel boundaryRef={boundaryRef} />}
          </FloatingWindowBounds>
          <ActiveDocMount>{children}</ActiveDocMount>
        </FloatingWindowHost>
      </AISvgChatProvider>
    </SvgDocStoreProvider>
  );
}

/**
 * `navigator.clipboard`-backed ClipboardProvider — the host-owned
 * transport seam (P2) for menu / RPC-invoked clipboard commands
 * (`clipboard.copy` / `cut` / `paste` via the command registry). The
 * keystroke path never touches this: ⌘C/⌘X/⌘V reach the editor as native
 * ClipboardEvents wired by the DOM surface. A denied read resolves to
 * `null` (the command treats it as an empty clipboard, not an error).
 */
const demo_providers: Providers = {
  clipboard: {
    write: (text) => navigator.clipboard.writeText(text),
    read: () => navigator.clipboard.readText().catch(() => null),
  },
};

function ActiveDocMount({ children }: PropsWithChildren) {
  const store = useSvgDocStore();
  const activeId = useSyncExternalStore(
    store.subscribe,
    store.getActiveId,
    store.getActiveId
  );
  const initialSvg = store.getActiveSvg();

  return (
    <SvgEditorProvider
      key={activeId ?? "__pending__"}
      initialSvg={initialSvg}
      providers={demo_providers}
    >
      <EditorBindingEffect />
      {children}
    </SvgEditorProvider>
  );
}
