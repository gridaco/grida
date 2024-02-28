import * as Popover from "@radix-ui/react-popover";
import { WidgetType, widgets } from "@code-editor/craft";
import { useDispatch } from "@/core/dispatch";
import React, { useCallback, useMemo, useState } from "react";
export function EditorAppbarModeCraftAddButton() {
  const dispatch = useDispatch();
  const [search, setSearch] = useState("");

  const display_widgets = useMemo(() => {
    return widgets
      .filter(([key, label]) => {
        return label.toLowerCase().includes(search.toLowerCase());
      })
      .filter(([key, label]) => {
        // filter out hidden widgets
        return widget_production_stage[key] !== "hidden";
      })
      .sort((a, b) => {
        // sort by widget_production_stage_priority
        const a_priority =
          widget_production_stage_priority[widget_production_stage[a[0]]];
        const b_priority =
          widget_production_stage_priority[widget_production_stage[b[0]]];
        return a_priority - b_priority;
      });
  }, [search]);

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
    <Popover.Root
      onOpenChange={() => {
        setSearch("");
      }}
    >
      <Popover.Trigger asChild>
        <button className="px-4 py-2 flex justify-center items-center gap-2 bg-transparent text-white border-none">
          <PlusIcon />
          Add
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          className="bg-neutral-800 z-30 elevated rounded-md shadow-md border border-white/10"
        >
          <div className="relative px-4 py-4 pt-0 w-96 max-h-[80vh] overflow-y-scroll">
            <div className="sticky top-0 pt-4 bg-neutral-800 z-10">
              <input
                autoFocus
                type="search"
                placeholder="🔎 Search"
                onChange={(e) => setSearch(e.target.value)}
                className="p-2 w-full rounded bg-transparent text-white"
              />
            </div>
            <div className="w-full flex flex-wrap gap-2 justify-center items-center">
              {display_widgets.map(([key, label]) => (
                <button
                  key={key}
                  className="relative w-40 h-40 flex flex-col gap-4 justify-center items-center hover:bg-white/10 p-2 rounded"
                  onClick={() => {
                    console.log("craft: add new node", key);
                    handleAddWidget(key);
                  }}
                >
                  {widget_production_stage_label[
                    widget_production_stage[key]
                  ] && (
                    <span
                      className="absolute top-2 right-2 px-1 py-1/2 rounded text-[8px] font-bold uppercase"
                      style={{
                        backgroundColor:
                          widget_production_stage_label[
                            widget_production_stage[key]
                          ][1],
                        color: "black",
                      }}
                    >
                      {
                        widget_production_stage_label[
                          widget_production_stage[key]
                        ][0]
                      }
                    </span>
                  )}
                  {React.createElement(widget_icons[key], {
                    className: "opacity-80",
                    width: 64,
                    height: 64,
                  })}
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

import {
  BoxIcon,
  PlayIcon,
  BadgeIcon,
  CodeIcon,
  ButtonIcon,
  CameraIcon,
  CheckboxIcon,
  DividerHorizontalIcon,
  PlusIcon,
  DividerVerticalIcon,
  LayoutIcon,
  FaceIcon,
  GridIcon,
  TextIcon,
  ColumnsIcon,
  ImageIcon,
  Link1Icon,
  ListBulletIcon,
  FileIcon,
  RadiobuttonIcon,
  StarIcon,
  ChevronDownIcon,
  Pencil1Icon,
  TableIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";

const widget_icons: {
  [key in WidgetType]: React.ComponentType<React.SVGProps<SVGSVGElement>>;
} = {
  audio: PlayIcon,
  badge: BadgeIcon,
  "builder-conditional": CodeIcon,
  "builder-stream": CodeIcon,
  button: ButtonIcon,
  camera: CameraIcon,
  checkbox: CheckboxIcon,
  chip: BadgeIcon,
  "chip-select": BadgeIcon,
  code: CodeIcon,
  container: BoxIcon,
  divider: DividerHorizontalIcon,
  "divider-vertical": DividerVerticalIcon,
  flex: LayoutIcon,
  "flex flex-col": ColumnsIcon,
  "flex flex-col wrap": ColumnsIcon,
  "flex flex-row": ColumnsIcon,
  "flex flex-row wrap": ColumnsIcon,
  "flex wrap": LayoutIcon,
  html: CodeIcon,
  icon: FaceIcon,
  "icon-button": ButtonIcon,
  "icon-toggle": ButtonIcon,
  iframe: CodeIcon,
  image: ImageIcon,
  "image-circle": ImageIcon,
  link: Link1Icon,
  list: ListBulletIcon,
  "locale-select": TextIcon,
  markdown: CodeIcon,
  pagination: FileIcon,
  pdf: FileIcon,
  pincode: TextIcon,
  progress: BoxIcon,
  "progress-circle": BoxIcon,
  radio: RadiobuttonIcon,
  rating: StarIcon,
  select: ChevronDownIcon,
  "self-stretch": BoxIcon,
  signature: Pencil1Icon,
  slider: BoxIcon,
  staggered: GridIcon,
  stepper: BoxIcon,
  switch: CodeIcon,
  tabs: TableIcon,
  text: TextIcon,
  textfield: TextIcon,
  tooltip: BoxIcon,
  video: CameraIcon,
} as const;

const widget_production_stage: {
  [key in WidgetType]: "prod" | "beta" | "soon" | "hidden";
} = {
  audio: "soon",
  badge: "soon",
  "builder-conditional": "soon",
  "builder-stream": "soon",
  button: "beta",
  camera: "soon",
  checkbox: "soon",
  chip: "soon",
  "chip-select": "soon",
  code: "soon",
  container: "prod",
  divider: "beta",
  "divider-vertical": "soon",
  flex: "beta",
  "flex flex-col": "beta",
  "flex flex-col wrap": "beta",
  "flex flex-row": "beta",
  "flex flex-row wrap": "beta",
  "flex wrap": "beta",
  html: "soon",
  icon: "beta",
  "icon-button": "soon",
  "icon-toggle": "soon",
  //
  iframe: "soon",
  image: "beta",
  "image-circle": "beta",
  link: "soon",
  list: "soon",
  "locale-select": "hidden",
  markdown: "soon",
  pagination: "soon",
  pdf: "soon",
  pincode: "soon",
  progress: "soon",
  "progress-circle": "soon",
  radio: "soon",
  rating: "soon",
  select: "soon",
  "self-stretch": "soon",
  signature: "soon",
  slider: "soon",
  staggered: "soon",
  stepper: "soon",
  switch: "soon",
  tabs: "soon",
  text: "beta",
  textfield: "beta",
  tooltip: "soon",
  video: "beta",
};

const widget_production_stage_priority = {
  prod: 0,
  beta: 1,
  soon: 2,
  hidden: 3,
} as const;

const widget_production_stage_label = {
  prod: null,
  beta: ["Beta", "skyblue"],
  soon: ["Soon", "orange"],
  hidden: "",
} as const;
