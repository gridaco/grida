"use client";

import { createContext } from "react";
import { cn } from "@app/ui/lib/utils";
import type { WorkbenchPanel } from "./workbench-panels";

/** Chat surfaces outside a tab present their content while mounted. */
export const PanelIsPresented = createContext(true);

/** A panel's content, kept mounted while another tab is in front. */
export function PanelTabContent({
  panel,
  active,
}: {
  panel: WorkbenchPanel | undefined;
  active: boolean;
}) {
  return (
    <div
      // A panel fills the editor region as a column, so content that sizes
      // itself with flex (a chat pane and its composer) gets a definite
      // height instead of growing past the region.
      className={cn(
        "absolute inset-0 flex min-h-0 flex-col overflow-hidden",
        !active && "invisible pointer-events-none"
      )}
      aria-hidden={!active}
    >
      <PanelIsPresented.Provider value={active}>
        {panel?.content}
      </PanelIsPresented.Provider>
    </div>
  );
}
