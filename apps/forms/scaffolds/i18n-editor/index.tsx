"use client";

import React from "react";
import { useEditorState } from "../editor";
import { DotsHorizontalIcon, DownloadIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SparkleIcon } from "lucide-react";
import { cn } from "@/utils";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function I18nEditor() {
  const [state] = useEditorState();
  const { lang, lang_default, langs, keys, resources } = state.document.g11n;

  return (
    <GridLayout.Root>
      <GridLayout.Header>Header</GridLayout.Header>
      <GridLayout.Content className="overflow-y-scroll">
        <div className="w-full divide-y">
          <GroupHeaderRow />
          {keys.map((key) => {
            return <DuoRow key={key} keyname={key} />;
          })}
          <GroupHeaderRow />
          {keys.map((key) => {
            return <DuoRow key={key} keyname={key} />;
          })}
        </div>
      </GridLayout.Content>
      <GridLayout.Footer>
        <Button variant="outline" size="sm">
          <DownloadIcon className="w-4 h-4 me-2" />
          Export
        </Button>
      </GridLayout.Footer>
    </GridLayout.Root>
  );
}

function DuoRow({ keyname }: { keyname: string }) {
  const [state] = useEditorState();
  const { lang, lang_default, langs, keys, resources } = state.document.g11n;
  const fallback = resources[lang_default]?.[keyname];
  return (
    <div className="group h-14 flex items-center px-4">
      <div className="flex-1 grow w-full h-full flex">
        <AnchorLangCell
          htmlFor={keyname}
          className="relative flex-1 w-full flex items-center"
        >
          {fallback || <span className="text-muted-foreground">(Empty)</span>}
          <br />
          <span className="absolute bottom-2 text-[8px] font-light text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {keyname}
          </span>
        </AnchorLangCell>
      </div>
      <div className="flex-1 grow w-full flex">
        <TargetLangCell
          id={keyname}
          placeholder={fallback || "(Empty)"}
          className="flex-1 w-full"
        />
      </div>
      <div className="flex items-center gap-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity">
        <Button variant="outline" size="icon" className="w-8 h-8">
          <SparkleIcon className="w-3 h-3" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="w-8 h-8">
              <DotsHorizontalIcon className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Copy Translation Key</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function GroupHeaderRow() {
  return (
    <div className="sticky top-0 z-10 bg-secondary text-secondary-foreground h-10 flex items-center px-4 border-b">
      Namespace
    </div>
  );
}

function AnchorLangCell({
  children,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <Label {...props} className={cn("text-foreground/80", className)}>
      {children}
    </Label>
  );
}

function TargetLangCell({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      type="text"
      {...props}
      autoComplete="nope" // https://stackoverflow.com/questions/12374442/chrome-ignores-autocomplete-off
      autoCorrect="off"
      className={cn(
        "border-none outline-none rounded-none focus-visible:ring-0 w-auto shadow-none",
        className
      )}
    />
  );
}
