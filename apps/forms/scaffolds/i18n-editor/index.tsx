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

export function I18nEditor() {
  const [state] = useEditorState();
  const { lang, lang_default, langs } = state.document.g11n;

  const keys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
  ];

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
  const value = "text" + keyname;
  return (
    <div className="group h-14 flex items-center px-4">
      <div className="flex-1 grow w-full flex">
        <AnchorLangCell htmlFor={keyname} className="flex-1 w-full">
          {value}
        </AnchorLangCell>
      </div>
      <div className="flex-1 grow w-full flex">
        <TargetLangCell
          id={keyname}
          placeholder={value}
          className="flex-1 w-full"
        />
      </div>
      <div className="invisible group-hover:visible flex items-center gap-2">
        <Button variant="outline" size="icon" className="w-8 h-8">
          <SparkleIcon className="w-3 h-3" />
        </Button>
        <Button variant="outline" size="icon" className="w-8 h-8">
          <DotsHorizontalIcon className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function GroupHeaderRow() {
  return (
    <div className="sticky top-0 bg-secondary text-secondary-foreground h-10 flex items-center px-4 border-b">
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
      autoComplete="off"
      className={cn(
        "border-none outline-none rounded-none focus-visible:ring-0 w-auto shadow-none",
        className
      )}
    />
  );
}
