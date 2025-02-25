"use client";

import React from "react";
import { useEditorState } from "../editor";
import { PlusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { CommandItem } from "@/components/ui/command";

export function InsertMenuTrigger() {
  const [state, dispatch] = useEditorState();
  const { insertmenu } = state;

  const openInsertMenu = (open: boolean) => {
    dispatch({
      type: "editor/panels/insert-menu",
      open: open,
    });
  };

  return (
    <Button
      role="combobox"
      variant={insertmenu.open ? "default" : "outline"}
      size="icon"
      className="rounded-full"
      onPointerDown={(e) => {
        // this shall not trigger focused block to lose focus
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        openInsertMenu(true);
      }}
    >
      <PlusIcon />
    </Button>
  );
}

function Item({
  children,
  ...props
}: React.ComponentProps<typeof CommandItem>) {
  return (
    <CommandItem key={props.value} {...props}>
      {children}
    </CommandItem>
  );
}
