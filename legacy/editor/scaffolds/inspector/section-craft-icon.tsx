import * as Popover from "@radix-ui/react-popover";
import { useDispatch } from "core/dispatch";
import { useCallback, useState } from "react";
import * as RadixIcons from "@radix-ui/react-icons";
import { useInspectorElement } from "hooks/use-inspector-element";
import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLine,
  PropertyLines,
} from "@editor-ui/property";
export function CraftIconSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onSelect = useCallback(
    (icon: string) => {
      dispatch({
        type: "(craft)/node/icon/data",
        data: icon,
      });
    },
    [dispatch]
  );

  if (!element || element.type !== "@radix-ui/react-icons") {
    return <></>;
  }

  const Icon = RadixIcons[element.icon];

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Icon</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Icon">
          <Popover.Root>
            <Popover.Trigger>
              <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent rounded border border-white/10">
                <Icon />
                <pre className="text-xs">{element.icon}</pre>
              </button>
            </Popover.Trigger>
            <Popover.Content side="bottom" align="start" className="bg-black">
              <RadixIconExplorer onSelect={onSelect} />
            </Popover.Content>
          </Popover.Root>
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

function RadixIconExplorer({ onSelect }: { onSelect: (icon: string) => void }) {
  // display all the icons

  return (
    <div className="rounded p-4 w-48 max-h-96 overflow-scroll gap-4 flex flex-wrap border border-white">
      {Object.keys(RadixIcons).map((iconName) => {
        const Icon = RadixIcons[iconName];
        return (
          <button
            className="p-1 w-6 h-6 flex items-center justify-center hover:bg-neutral-500/10"
            key={iconName}
            onClick={() => onSelect(iconName)}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
