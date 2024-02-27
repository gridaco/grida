import * as Popover from "@radix-ui/react-popover";
import { WidgetType, widgets } from "@code-editor/craft";
import { PlusIcon } from "@radix-ui/react-icons";
import { useDispatch } from "@/core/dispatch";
import { useCallback } from "react";

export function EditorAppbarModeCraftAddButton() {
  const dispatch = useDispatch();

  const handleAddWidget = useCallback(
    (widget: WidgetType) => {
      dispatch({
        type: "(craft)/widget/new",
        widget,
      });
    },
    [dispatch]
  );

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent text-white border-none">
          <PlusIcon />
          Add
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="bg-black z-30 elevated rounded">
          <div className="flex gap-2 flex-col p-4 max-h-80 overflow-scroll">
            {widgets.map(([key, label]) => (
              <button
                className="cursor-pointer hover:bg-white/10 p-2 rounded"
                key={key}
                onClick={() => {
                  console.log("craft: add new node", key);
                  handleAddWidget(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
