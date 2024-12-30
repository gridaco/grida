"use client";

import React from "react";
import { useDocument } from "@/grida-react-canvas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ThemedMonacoEditor } from "@/components/monaco";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useGoogleFontsList } from "../google.fonts";
import { useThrottle } from "@uidotdev/usehooks";
import { __UNSAFE_CONSOLE } from "@/scaffolds/playground-canvas/__unsafe-console";
import type { grida } from "@/grida";

export function DevtoolsPanel() {
  const { state: _state } = useDocument();
  const fonts = useGoogleFontsList();
  const expandable = useDialogState();

  const state = useThrottle(_state, 1000);

  const {
    document,
    document_ctx,
    history,
    googlefonts,
    user_clipboard,
    ...state_without_document
  } = state;

  const onTabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    expandable.openDialog();
  };

  return (
    <Collapsible {...expandable.props}>
      <Tabs defaultValue="document" className="border w-full h-full">
        <div
          onClick={expandable.toggleOpen}
          className="w-full flex justify-between border-b bg-muted"
        >
          <div className="w-full">
            <TabsList>
              <TabsTrigger
                onClick={onTabClick}
                value="console"
                className="text-xs uppercase"
              >
                Console
              </TabsTrigger>
              <TabsTrigger
                onClick={onTabClick}
                value="document"
                className="text-xs uppercase"
              >
                Document
              </TabsTrigger>
            </TabsList>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              onClick={(e) => e.stopPropagation()}
              variant="ghost"
              size="icon"
            >
              {expandable.open ? <CaretDownIcon /> : <CaretUpIcon />}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="w-full h-96 overflow-y-scroll">
          <TabsContent value="console" className="h-full">
            <__UNSAFE_CONSOLE />
          </TabsContent>
          <TabsContent value="document" className="h-full">
            <Tabs defaultValue="document" className="w-full h-full">
              <TabsList className="mx-2">
                <TabsTrigger value="hierarchy" className="text-xs uppercase">
                  Hierarchy
                </TabsTrigger>
                <TabsTrigger value="document" className="text-xs uppercase">
                  Document
                </TabsTrigger>
                <TabsTrigger value="editor" className="text-xs uppercase">
                  Editor
                </TabsTrigger>
                <TabsTrigger value="fonts" className="text-xs uppercase">
                  Fonts
                </TabsTrigger>
                <TabsTrigger value="clipboard" className="text-xs uppercase">
                  Clipboard
                </TabsTrigger>
              </TabsList>
              <TabsContent value="hierarchy" className="h-full">
                <JSONContent
                  value={devdata_hierarchy_only(document, document_ctx)}
                />
              </TabsContent>
              <TabsContent value="document" className="h-full">
                <JSONContent value={{ document, document_ctx }} />
              </TabsContent>
              <TabsContent value="editor" className="h-full">
                <JSONContent value={state_without_document} />
              </TabsContent>
              <TabsContent value="clipboard" className="h-full">
                <JSONContent value={user_clipboard} />
              </TabsContent>
              <TabsContent value="fonts" className="h-full">
                <JSONContent
                  value={{
                    // used fonts
                    fonts: googlefonts,
                    // all fonts
                    registry: fonts,
                  }}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

function devdata_hierarchy_only(
  document: grida.program.document.IDocumentDefinition,
  document_ctx: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext
) {
  const { root_id, nodes } = document;
  return {
    root_id: root_id,
    document_ctx,
    nodes: Object.entries(nodes).reduce((acc: any, [id, node]) => {
      acc[id] = {
        id: node.id,
        name: node.name,
        type: node.type,
        children: (node as any).children,
      };
      return acc;
    }, {}),
  };
}

function JSONContent({ value }: { value: unknown }) {
  return (
    <div className="h-full">
      <ThemedMonacoEditor
        height="100%"
        width="100%"
        defaultLanguage="json"
        value={JSON.stringify(value, null, 2)}
        options={{
          minimap: { enabled: false },
          readOnly: true,
        }}
      />
    </div>
  );
}
