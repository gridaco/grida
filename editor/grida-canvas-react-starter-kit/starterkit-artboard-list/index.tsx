import React from "react";
import { ChevronDown } from "lucide-react";
import cmath from "@grida/cmath";
import artboardData from "../data/artboards.json";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCurrentEditor } from "@/grida-canvas-react";

type ArtboardData = {
  name: string;
  width: number;
  height: number;
};

const ArtboardList = () => {
  const editor = useCurrentEditor();

  const onClickItem = (item: ArtboardData) => {
    editor.commands.insertNode({
      type: "container",
      position: "absolute",
      name: item.name,
      width: item.width,
      height: item.height,
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.WHITE,
        active: true,
      },
      children: [],
    });
  };

  // TODO: have a session storage to store the last opened state
  return (
    <div className="w-full divide-y overflow-hidden">
      {Object.entries(artboardData).map(([categoryName, items], index) => (
        <Collapsible key={index} defaultOpen={index === 0}>
          <CollapsibleTrigger className="p-2 my-1 focus:outline-none">
            <div className="flex items-center justify-between cursor-pointer">
              <ChevronDown size={16} className="text-muted-foreground me-2" />
              <span className="font-medium capitalize text-xs">
                {categoryName}
              </span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-1">
              {items.map((item, idx) => (
                <li key={idx} className="w-full">
                  <button
                    className="px-4 py-2 w-full flex justify-between text-muted-foreground gap-2 hover:bg-accent"
                    onClick={() => {
                      onClickItem(item);
                    }}
                  >
                    <span className="text-xs truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground opacity-50">
                      {item.width}×{item.height}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
};

export default ArtboardList;
