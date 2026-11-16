"use client";

import { useSyncExternalStore, type PropsWithChildren } from "react";
import { SvgEditorProvider } from "@grida/svg-editor/react";
import type { Providers } from "@grida/svg-editor";
import { FloatingWindowHost } from "@/components/floating-window";
import { SvgDocStoreProvider, useSvgDocStore } from "./context";
import { EditorBindingEffect } from "./editor-binding-effect";

/**
 * Shared SVG demo scaffold with document storage, floating Library windows,
 * and a keyed editor binding. The document store survives active-document
 * changes while the editor and its binding remount for the selected document.
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
      <FloatingWindowHost>
        <ActiveDocMount>{children}</ActiveDocMount>
      </FloatingWindowHost>
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
