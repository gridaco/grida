"use client";

import React from "react";
import { useDocument } from "@/builder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Editor as MonacoEditor } from "@monaco-editor/react";

export function DevtoolsPanel() {
  return (
    <Collapsible>
      <Tabs defaultValue="document" className="border-t">
        <div className="w-full flex justify-between border-b">
          <div className="w-full">
            <TabsList className="m-2">
              <TabsTrigger value="document">Document</TabsTrigger>
            </TabsList>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" className="m-2">
              <CaretDownIcon />
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
