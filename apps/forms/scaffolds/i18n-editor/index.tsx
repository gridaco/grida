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
import { language_label_map } from "@/k/supported_languages";
import { useG11nResource } from "../editor/use";
import { Badge } from "@/components/ui/badge";

export function I18nEditor() {
  const [state] = useEditorState();
  const { lang, lang_default, keys } = state.document.g11n;

  return (
    <GridLayout.Root>
      <GridLayout.Header>
        <div className="w-full flex justify-between">
          <Label className="flex-1">
            {language_label_map[lang_default].flag}{" "}
            {language_label_map[lang_default].label}
          </Label>
          <Label className="flex-1 ps-4">
            {language_label_map[lang].flag} {language_label_map[lang].label}
          </Label>
        </div>
      </GridLayout.Header>
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
  const { lang, lang_default, langs, keys } = state.document.g11n;

  const resource = useG11nResource(keyname);

  const badge: "done" | "todo" = resource.value ? "done" : "todo";

  return (
    <div className="relative group h-14 flex items-center px-4">
      <div className="flex-1 grow w-full h-full flex">
        <AnchorLangCell
          htmlFor={keyname}
          className="relative flex-1 w-full flex items-center"
        >
          {resource.fallback || (
            <span className="text-muted-foreground">(Empty)</span>
          )}
          <br />
          <span className="absolute bottom-2 text-[8px] font-light text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {keyname}
          </span>
        </AnchorLangCell>
      </div>
      <div className="flex-1 grow w-full h-full flex">
        <TargetLangCell
          key={lang + keyname}
          id={keyname}
          placeholder={resource.fallback || "(Empty)"}
          value={resource.value ?? ""}
          onChange={(e) => {
            resource.change(e.target.value || undefined);
          }}
          className="flex-1 w-full flex items-center h-full"
        />
      </div>
      <div className="absolute right-4 flex items-center gap-2 transition-opacity invisible opacity-0 group-hover:visible group-hover:opacity-100">
        <div className="flex items-center gap-2  ">
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
              <DropdownMenuItem
                onSelect={() => {
                  alert("Not implemented yet - contact support");
                }}
              >
                Copy Translation Key
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="absolute right-4 flex items-center gap-2 transition-opacity visible group-hover:invisible">
        <div className="">
          <Badge
            variant={badge === "todo" ? "default" : "secondary"}
            className="capitalize"
          >
            {badge}
          </Badge>
        </div>
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
