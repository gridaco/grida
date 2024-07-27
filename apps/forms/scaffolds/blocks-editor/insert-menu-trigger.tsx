"use client";

import React from "react";
import { useEditorState } from "../editor";
import { PlusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { CommandItem } from "@/components/ui/command";

export function InsertMenuTrigger() {
  const [state, dispatch] = useEditorState();
  const { is_insert_menu_open } = state;

  const openInsertMenu = (open: boolean) => {
    dispatch({
      type: "editor/panels/insert-menu",
      open: open,
    });
  };

  return (
    <Button
      role="combobox"
      variant={is_insert_menu_open ? "default" : "outline"}
      size="icon"
      className="rounded-full"
      onClick={() => openInsertMenu(true)}
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
