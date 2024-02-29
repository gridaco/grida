import React from "react";
import type { WidgetType } from "../widgets";
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
  [key in WidgetType]: React.ForwardRefExoticComponent<
    React.RefAttributes<SVGSVGElement>
  >;
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

export function WidgetIcon({ name }: { name: WidgetType }) {
  return (
    <>
      {React.createElement(widget_icons[name], {
        // @ts-ignore
        className: "opacity-80",
        width: 64,
        height: 64,
      })}
    </>
  );
}
