"use client";

import React, { useState } from "react";
import { useDocument } from "@/builder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Editor as MonacoEditor } from "@monaco-editor/react";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useGoogleFontsList } from "../google.fonts";

export function DevtoolsPanel() {
  const expandable = useDialogState();

  const onTabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    expandable.openDialog();
  };

  return (
    <Collapsible {...expandable.props}>
      <Tabs defaultValue="document" className="border-t">
        <div
          onClick={expandable.toggleOpen}
          className="w-full flex justify-between border-b"
        >
          <div className="w-full">
            <TabsList className="m-2">
              <TabsTrigger onClick={onTabClick} value="document">
                Document
              </TabsTrigger>
              <TabsTrigger onClick={onTabClick} value="fonts">
                Fonts
              </TabsTrigger>
            </TabsList>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              onClick={(e) => e.stopPropagation()}
              variant="outline"
              size="icon"
              className="m-2"
            >
              {expandable.open ? <CaretDownIcon /> : <CaretUpIcon />}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="h-96">
          <TabsContent
            value="document"
            className="p-2 overflow-scroll w-full h-full"
          >
            <DocumentTabContent />
          </TabsContent>
          <TabsContent
            value="fonts"
            className="p-2 overflow-scroll w-full h-full"
          >
            <FontsTabContent />
          </TabsContent>
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

function DocumentTabContent() {
  const { state } = useDocument();

  return (
    <div className="w-full h-full">
      <MonacoEditor
        height="100%"
        width="100%"
        defaultLanguage="json"
        value={JSON.stringify(state, null, 2)}
        options={{
          minimap: { enabled: false },
          readOnly: true,
        }}
      />
    </div>
  );
}

function FontsTabContent() {
  const fonts = useGoogleFontsList();
  const { state } = useDocument();

  return (
    <div className="w-full h-full">
      <MonacoEditor
        height="100%"
        width="100%"
        defaultLanguage="json"
        value={JSON.stringify(fonts, null, 2)}
        options={{
          minimap: { enabled: false },
          readOnly: true,
        }}
      />
    </div>
  );
}
