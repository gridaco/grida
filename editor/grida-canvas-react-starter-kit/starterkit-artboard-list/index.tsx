import React from "react";
import { ChevronDown } from "lucide-react";
import kolor from "@grida/color";
import artboardData from "../data/artboards.json";
import { useSessionStorage } from "@uidotdev/usehooks";
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
  year?: number;
};

const ArtboardList = () => {
  const editor = useCurrentEditor();

  const SESSION_STORAGE_KEY = "grida.starterkit.artboard_list.open_category";
  const OPEN_CATEGORY_UNSET = "__unset__";
  const OPEN_CATEGORY_NONE = "__none__";

  const [openCategory, setOpenCategory] = useSessionStorage(
    SESSION_STORAGE_KEY,
    OPEN_CATEGORY_UNSET
  );

  const onClickItem = (item: ArtboardData) => {
    editor.commands.insertNode({
      type: "container",
      position: "absolute",
      name: item.name,
      width: item.width,
      height: item.height,
      fill: {
        type: "solid",
        color: kolor.colorformats.RGBA32F.WHITE,
        active: true,
      },
      children: [],
    });
  };

  return (
    <div className="w-full divide-y overflow-hidden">
      {Object.entries(artboardData).map(([categoryName, items], index) => (
        <Collapsible
          key={categoryName}
          open={
            openCategory === OPEN_CATEGORY_UNSET
              ? index === 0
              : openCategory === OPEN_CATEGORY_NONE
                ? false
                : openCategory === categoryName
          }
          onOpenChange={(open) => {
            setOpenCategory(open ? categoryName : OPEN_CATEGORY_NONE);
          }}
        >
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
                    <span className="text-[11px] truncate">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground opacity-50">
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
