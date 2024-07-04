"use client";

import "@blocknote/core/fonts/inter.css";
import { BlockNoteViewProps, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./styles.css";
import React from "react";
import { cn } from "@/utils";

// import { BlockNoteView } from "@blocknote/shadcn";
// https://github.com/TypeCellOS/BlockNote/issues/880
// importing this will break border in darkmode for existing shadcn components & classes
// import "@blocknote/shadcn/style.css";
// import "@blocknote/react/style.css";
// import * as Tooltip from "@/components/ui/tooltip";
// import * as Badge from "@/components/ui/badge";
// import * as Button from "@/components/ui/button";
// import * as Card from "@/components/ui/card";
// import * as Popover from "@/components/ui/popover";
// import * as Select from "@/components/ui/select";
// import * as Tabs from "@/components/ui/tabs";
// import * as Toggle from "@/components/ui/toggle";
// import * as Input from "@/components/ui/input";
// import * as Label from "@/components/ui/label";
// import * as DropdownMenu from "@/components/ui/dropdown-menu";
// shadCNComponents={{
//   Badge,
//   Button,
//   Card,
//   DropdownMenu,
//   Input,
//   Label,
//   Popover,
//   Select,
//   Tabs,
//   Toggle,
//   Tooltip,
// }}

export default function ThemedRichTextEditorContent({
  children,
  ...props
}: React.PropsWithChildren<BlockNoteViewProps<any, any, any>>) {
  return (
    <>
      {children}
      <BlockNoteView
        data-theming-ui-css-variables
        {...props}
        className={cn(
          "min-h-[120px] h-full w-full bg-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          props.className
        )}
      />
    </>
  );
}
