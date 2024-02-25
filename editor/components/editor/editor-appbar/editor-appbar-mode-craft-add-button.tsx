import * as Popover from "@radix-ui/react-popover";
import { widgets } from "@code-editor/craft";
import { PlusIcon } from "@radix-ui/react-icons";

export function EditorAppbarModeCraftAddButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent text-white border-none">
          <PlusIcon />
          Add
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="z-30 bg-white elevated rounded">
          <div className="flex gap-2 flex-col p-4 max-h-80 overflow-scroll">
            {widgets.map(([key, label]) => (
              <button
                className="cursor-pointer hover:bg-gray-100 p-2 rounded"
                key={key}
                onClick={() => {
                  //
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
