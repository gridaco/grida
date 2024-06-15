"use client";

import React, { useCallback } from "react";
import { useEditorState } from "../editor";
import {
  CodeIcon,
  DividerHorizontalIcon,
  HeadingIcon,
  ImageIcon,
  PlusCircledIcon,
  PlusIcon,
  ReaderIcon,
  SectionIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import { FormBlockType } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NewBlockButton() {
  const [state, dispatch] = useEditorState();
  const [open, setOpen] = React.useState(false);

  const addBlock = useCallback(
    (block: FormBlockType) => {
      dispatch({
        type: "blocks/new",
        block: block,
      });

      setOpen(false);
    },
    [dispatch]
  );

  const addSectionBlock = useCallback(() => addBlock("section"), [addBlock]);
  const addFieldBlock = useCallback(() => addBlock("field"), [addBlock]);
  const addHtmlBlock = useCallback(() => addBlock("html"), [addBlock]);
  const addDividerBlock = useCallback(() => addBlock("divider"), [addBlock]);
  const addHeaderBlock = useCallback(() => addBlock("header"), [addBlock]);
  const addImageBlock = useCallback(() => addBlock("image"), [addBlock]);
  const addVideoBlock = useCallback(() => addBlock("video"), [addBlock]);
  const addPdfBlock = useCallback(() => addBlock("pdf"), [addBlock]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          role="combobox"
          variant="outline"
          size="icon"
          aria-expanded={open}
          className="rounded-full"
        >
          <PlusIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        sideOffset={8}
        side="bottom"
        align="start"
        className="w-[200px] p-0"
      >
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              <Item onSelect={addFieldBlock} value="field" key="field">
                <PlusCircledIcon className="me-2 align-middle" />
                Field
              </Item>
              <Item onSelect={addImageBlock} value="image" key="image">
                <ImageIcon className="me-2 align-middle" />
                Image
              </Item>
              <Item onSelect={addVideoBlock} value="video" key="video">
                <VideoIcon className="me-2 align-middle" />
                Video
              </Item>
              <Item onSelect={addHtmlBlock} value="html" key="html">
                <CodeIcon className="me-2 align-middle" />
                HTML
              </Item>
              <Item onSelect={addPdfBlock} value="pdf" key="pdf">
                <ReaderIcon className="me-2 align-middle" />
                Pdf
              </Item>
              <Item onSelect={addDividerBlock} value="divider" key="divider">
                <DividerHorizontalIcon className="me-2 align-middle" />
                Divider
              </Item>
              <Item onSelect={addSectionBlock} value="section" key="section">
                <SectionIcon className="me-2 align-middle" />
                Section
              </Item>
              <Item onSelect={addHeaderBlock} value="header" key="header">
                <HeadingIcon className="me-2 align-middle" />
                Header
              </Item>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
