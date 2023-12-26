import * as Popover from "@radix-ui/react-popover";
import { widgets } from "@code-editor/craft";

export function EditorAppbarModeCraftAddButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button>Add</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="z-30 bg-white elevated rounded">
          <div className="flex gap-2 flex-col p-4 max-h-80 overflow-scroll">
            {widgets.map(([key, label]) => (
              <div
                className="cursor-pointer hover:bg-gray-100 p-2 rounded"
                key={key}
              >
                {label}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
