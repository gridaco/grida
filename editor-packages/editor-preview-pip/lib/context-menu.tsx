import React, { useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ContextMenuContent,
  ContextMenuCheckboxItem,
  ContextMenuTrigger,
  ContextMenuItem,
} from "@modulz/design-system";
import { BlockFrameInteraction } from "./preferences";

export default function VanillaFrameContextManuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>

      <ContextMenuContent>
        <AllowInteractionPreferenceMenu />
      </ContextMenuContent>
    </ContextMenu.Root>
  );
}

function AllowInteractionPreferenceMenu() {
  const [allowInteraction, setAllowInteraction] = useState(
    BlockFrameInteraction.get()
  );

  return (
    <ContextMenuCheckboxItem
      checked={allowInteraction}
      onSelect={() => {
        const inverted = !allowInteraction;
        BlockFrameInteraction.set(inverted);
        setAllowInteraction(inverted);
      }}
    >
      <ContextMenu.Label>Allow interaction</ContextMenu.Label>
    </ContextMenuCheckboxItem>
  );
}
