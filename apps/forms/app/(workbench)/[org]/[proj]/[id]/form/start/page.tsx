"use client";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { SideControl } from "@/scaffolds/sidecontrol";
import React, { useCallback, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet-without-overlay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEditorState } from "@/scaffolds/editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useDebounceCallback } from "usehooks-ts";
import { Block, BlockNoteEditor } from "@blocknote/core";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSyncFormAgentStartPage } from "@/scaffolds/editor/sync";
import { FormStartPage } from "@/theme/templates/formstart";
import { useDocumentAssetUpload } from "@/scaffolds/asset";
import {
  CMSImageAssetField,
  CMSRichText,
  CMSVideoAssetField,
} from "@/components/formfield-cms";
import { SandboxWrapper } from "@/scaffolds/form-templates/sandbox";
import { BrowseStartPageTemplatesDialog } from "@/scaffolds/form-templates/startpage-templates-dialog";
import { ErrorBoundary } from "react-error-boundary";
import { grida } from "@/grida";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CurrentPage } from "@/scaffolds/editor/utils/current-page";
import { Spinner } from "@/components/spinner";
import {
  StandaloneDocumentEditor,
  CanvasEventTarget,
  CanvasOverlay,
  useDocument,
  useRootTemplateInstanceNode,
} from "@/builder";
import { composeEditorDocumentAction } from "@/scaffolds/editor/action";
import { BuilderAction } from "@/builder/action";
import { DevtoolsPanel } from "@/builder/devtools";
import { Badge } from "@/components/ui/badge";

export default function FormStartEditPage() {
  const [state, dispatch] = useEditorState();

  useSyncFormAgentStartPage();

  const {
    documents: { "form/startpage": startpage },
  } = state;

  const startPageDocumentDispatch = useCallback(
    (action: BuilderAction) => {
      dispatch(composeEditorDocumentAction("form/startpage", action));
    },
    [dispatch]
  );

  return (
    <CurrentPage
      page="form/startpage"
      fallback={
        <div className="h-full w-full flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <main className="h-full flex flex-1 w-full">
        {startpage ? (
          <StandaloneDocumentEditor
            initial={startpage}
            dispatch={startPageDocumentDispatch}
          >
            <div className="w-full h-full flex flex-col">
              <CanvasEventTarget className="relative w-full no-scrollbar overflow-y-auto bg-transparent pointer-events-none">
                <CanvasOverlay />
                <AgentThemeProvider>
                  <StartPageEditor />
                </AgentThemeProvider>
              </CanvasEventTarget>
              {process.env.NODE_ENV === "development" && <DevtoolsPanel />}
            </div>
            <aside className="hidden lg:flex h-full">
              <SideControl />
            </aside>
          </StandaloneDocumentEditor>
        ) : (
          <SetupStartPage />
        )}
      </main>
    </CurrentPage>
  );
}

function SetupStartPage() {
  const [state, dispatch] = useEditorState();
  const dialog = useDialogState("browse-start-page-templates");

  const setupStartPage = useCallback(
    (name: string) => {
      const __template = FormStartPage.getTemplate(name);
      // exclude component
      const { component: __exclude, ...template } = __template;

      dispatch({
        type: "editor/form/startpage/init",
        template: template,
      });
    },
    [dispatch]
  );

  return (
    <>
      <BrowseStartPageTemplatesDialog
        {...dialog}
        onValueCommit={(template_id) => {
          setupStartPage(template_id);
        }}
      />
      <div className="w-full h-full flex items-center justify-center">
        <Card className="max-w-sm">
          <CardHeader>
            <Badge className="w-min mb-4" variant="outline">
              BETA
            </Badge>
            <CardTitle>Add a cover page for your campaign</CardTitle>
            <CardDescription>
              You can add a engaging cover (start) page for this campaign. By
              adding a cover page, you can make your campaign a microsite with
              event details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={dialog.openDialog}>Browse Templates</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StartPageEditor() {
  const [edit, setEdit] = useState(false);

  const [rootstate] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = rootstate;

  const { state } = useDocument();

  return (
    <>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <PropertiesEditSheet open={edit} onOpenChange={setEdit} />
      </ErrorBoundary>

      <div className="w-full px-10 overflow-scroll">
        <div className="w-full mx-auto my-20 max-w-sm xl:max-w-4xl z-[-999]">
          <SandboxWrapper
            // hover:outline hover:outline-2 hover:outline-workbench-accent-sky
            className={"rounded-2xl shadow-2xl border overflow-hidden"}
            onDoubleClick={() => {
              setEdit(true);
            }}
          >
            <div className="w-full min-h-[852px] h-[80dvh]">
              <FormStartPage.TemplateRenderer
                // TODO: with dynamic renderer
                name={
                  (
                    state.document.nodes[
                      state.document.root_id!
                    ] as grida.program.nodes.TemplateInstanceNode
                  ).template_id
                }
                meta={campaign}
                lang={lang}
              />
            </div>
          </SandboxWrapper>
        </div>
      </div>
    </>
  );
}

function PropertiesEditSheet({ ...props }: React.ComponentProps<typeof Sheet>) {
  const { changeRootProps, rootProperties, rootProps } =
    useRootTemplateInstanceNode();
  const [state, dispatch] = useEditorState();

  const { uploadPublic } = useDocumentAssetUpload();

  const debouncedRichTextHtmlChange = useDebounceCallback(
    (editor: BlockNoteEditor<any>, content: Block[]) => {
      editor.blocksToHTMLLossy(content).then((html) => {
        changeRootProps("body_html", html);
      });
    },
    300
  );

  const {
    form: { campaign },
  } = state;

  const keys = Object.keys(rootProperties);

  return (
    <Sheet {...props}>
      <SheetContent className="flex flex-col xl:w-[800px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none p-0">
        <SheetHeader className="p-4">
          <SheetTitle>Page Content</SheetTitle>
          <SheetDescription>
            Edit the content of the page here.
          </SheetDescription>
        </SheetHeader>
        <hr />
        <ScrollArea>
          <ScrollBar />
          <div className="px-4 grid gap-4">
            <div className="grid gap-2">
              <Collapsible>
                <CollapsibleTrigger>
                  <Label>About This Campaign</Label>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Scheduling</TableCell>
                        <TableCell>
                          {campaign.is_scheduling_enabled ? "ON" : "OFF"}
                        </TableCell>
                      </TableRow>
                      {campaign.is_scheduling_enabled && (
                        <>
                          <TableRow>
                            <TableCell>Scheduling Time Zone</TableCell>
                            <TableCell>
                              {campaign.scheduling_tz ?? "-"}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Scheduling Open At</TableCell>
                            <TableCell>
                              {campaign.scheduling_open_at
                                ? new Date(
                                    campaign.scheduling_open_at
                                  ).toLocaleString()
                                : "-"}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Scheduling Close At</TableCell>
                            <TableCell>
                              {campaign.scheduling_close_at
                                ? new Date(
                                    campaign.scheduling_close_at
                                  ).toLocaleString()
                                : "-"}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Max Responses in total</TableCell>
                            <TableCell>
                              {campaign.max_form_responses_in_total ?? "∞"}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                      <TableRow>
                        <TableCell>Max Responses by customer</TableCell>
                        <TableCell>
                          {campaign.max_form_responses_by_customer ?? "∞"}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            </div>
            <div className="w-full grid gap-4">
              {keys.map((key) => {
                const def = rootProperties[key];

                const change = (value: any) => {
                  changeRootProps(key, value);
                };

                const value = rootProps[key];

                return (
                  <div key={key} className="grid gap-2">
                    <Label>{key}</Label>
                    <PropertyField
                      name={key}
                      definition={def}
                      value={value}
                      onValueChange={change}
                    />
                  </div>
                );
              })}
            </div>
            {/* <div className="grid gap-2">
              <Label>Media</Label>
              <CMSImageAssetField
                uploader={uploadPublic}
                value={rootValues.media as any}
                onValueChange={(asset) => {
                  changeRootProperties("media", asset);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Content</Label>
              <CMSRichText
                defaultValue={rootValues.body as any}
                onContentChange={(editor, content) => {
                  changeRootProperties("body", content);
                  debouncedRichTextHtmlChange(editor, content);
                }}
              />
            </div> */}
          </div>
          <div className="h-40" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function PropertyField({
  definition,
  name,
  value,
  onValueChange,
}: {
  definition: grida.program.schema.PropertyDefinition;
  value: any;
  onValueChange: (value: any) => void;
  name: string;
}) {
  const { uploadPublic } = useDocumentAssetUpload();

  switch (definition.type) {
    case "string":
      return (
        <Input
          // TODO: support tokens
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
          }}
          placeholder={definition.default as string}
        />
      );

    case "image":
      return (
        <CMSImageAssetField
          uploader={uploadPublic}
          value={value as any}
          onValueChange={(asset) => {
            // FIXME: match signature
            onValueChange(asset);
          }}
        />
      );
    case "video":
      return (
        <CMSVideoAssetField
          uploader={uploadPublic}
          value={value as any}
          onValueChange={(asset) => {
            // FIXME: match signature
            onValueChange(asset);
          }}
        />
      );
  }
}
