import React from "react";
import { DndContext } from "@dnd-kit/core";

export function EditorGlobalDndContextProvider({
  children,
}: React.PropsWithChildren<{}>) {
  return <DndContext>{children}</DndContext>;
}
