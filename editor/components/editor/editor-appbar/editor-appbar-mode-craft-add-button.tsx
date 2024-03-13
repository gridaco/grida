import * as Popover from "@radix-ui/react-popover";
import { CraftAddButton, WidgetType, widgets } from "@code-editor/craft";
import { useDispatch } from "@/core/dispatch";
import React, { useCallback, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";

export function EditorAppbarModeCraftAddButton() {
  const dispatch = useDispatch();

  return (
    <CraftAddButton
      onAddWidget={(widget) => {
        dispatch({
          type: "(craft)/widget/new",
          widget,
        });
      }}
    />
  );
}
