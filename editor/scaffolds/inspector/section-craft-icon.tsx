import * as Popover from "@radix-ui/react-popover";
import { useDispatch } from "core/dispatch";
import { useCallback, useState } from "react";
import * as RadixIcons from "@radix-ui/react-icons";
export function CraftIconSection() {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent text-white border-none">
          <RadixIcons.PlusIcon />
          Add
        </button>
      </Popover.Trigger>
      <Popover.Content>
        <RadixIconExplorer />
      </Popover.Content>
    </Popover.Root>
  );
}

function RadixIconExplorer() {
  // display all the icons

  return (
    <div className="rounded p-4 w-48 max-h-96 overflow-scroll gap-4 flex flex-wrap bg-white">
      {Object.keys(RadixIcons).map((iconName) => {
        const Icon = RadixIcons[iconName];
        return (
          <div
            className="p-1 w-6 h-6 flex items-center justify-center hover:bg-neutral-500/10"
            key={iconName}
          >
            <Icon />
          </div>
        );
      })}
    </div>
  );
}
