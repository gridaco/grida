"use client";
import { FormEditorAgentThemeProvider } from "@/scaffolds/agent-form-builder/theme";
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
import grida from "@grida/schema";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CurrentPage } from "@/scaffolds/editor/utils/current-page";
import { Spinner } from "@/components/spinner";
import {
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
  useDocument,
  useRootTemplateInstanceNode,
} from "@/grida-react-canvas";
import { composeEditorDocumentAction } from "@/scaffolds/editor/action";
import type { Action as CanvasAction } from "@/grida-canvas";
import { DevtoolsPanel } from "@/grida-react-canvas/devtools";
import { Badge } from "@/components/ui/badge";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { ErrorInvalidSchema } from "@/components/error";

export default function FormStartEditPage() {
  const [state] = useEditorState();

  const {
    documents: { "form/startpage": startpage },
  } = state;

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
        {startpage ? <Exists /> : <SetupStartPage />}
      </main>
    </CurrentPage>
  );
}

function Exists() {
  const [state] = useEditorState();

  const {
    documents: { "form/startpage": startpage },
  } = state;

  if (!startpage || !startpage.__schema_valid) {
    return (
      <ErrorInvalidSchema
        data={{ __schema_version: startpage?.__schema_version }}
      />
    );
  }

  return null;
  // FIXME: fix useEditor
  // return <Ready />;
}

/*
// FIXME: fix useEditor
function Ready() {
  const [
    {
      documents: { "form/startpage": startpage },
    },
    dispatch,
  ] = useEditorState();
  const state = startpage!.state!;
  useSyncFormAgentStartPage();
  const startPageDocumentDispatch = useCallback(
    (action: CanvasAction) => {
      dispatch(composeEditorDocumentAction("form/startpage", action));
    },
    [dispatch]
  );
  return (
    <StandaloneDocumentEditor
      key={state.template_id}
      editable
      initial={{
        ...state,
        templates: {
          [state.template_id]: FormStartPage.getTemplate(state.template_id),
        },
      }}
      dispatch={startPageDocumentDispatch}
    >
      <div className="w-full h-full flex flex-col">
        <StartPageEditor template_id={state.template_id} />
        {process.env.NODE_ENV === "development" && <DevtoolsPanel />}
      </div>
      <aside className="hidden lg:flex h-full">
        <SideControl />
      </aside>
    </StandaloneDocumentEditor>
  );
}
 */

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
        {...dialog.props}
        onValueCommit={(template_id) => {
          setupStartPage(template_id);
        }}
      />
      <div className="w-full h-full flex items-center justify-center">
        <Card className="max-w-sm">
          <CardHeader>
            <div className="flex gap-2 items-center mb-4">
              <Badge className="w-min" variant="outline">
                ALPHA
              </Badge>
              <span className="text-xs text-muted-foreground">
                UNSTABLE Technical preview
              </span>
            </div>
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

function StartPageEditor({ template_id }: { template_id: string }) {
  const [edit, setEdit] = useState(false);

  const [rootstate] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = rootstate;

  return (
    <>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <PropertiesEditSheet open={edit} onOpenChange={setEdit} />
      </ErrorBoundary>

      <ViewportRoot
        onDoubleClick={() => {
          console.log("dblclick");
          setEdit(true);
        }}
        className="relative w-full no-scrollbar overflow-y-auto bg-transparent"
      >
        <EditorSurface />
        <FormEditorAgentThemeProvider>
          <div className="w-full px-10 overflow-scroll">
            <div className="w-full mx-auto my-20 max-w-sm xl:max-w-4xl z-[-999]">
              <SandboxWrapper className="pointer-events-auto rounded-2xl shadow-2xl border overflow-hidden hover:outline hover:outline-2 hover:outline-workbench-accent-sky">
                <div className="w-full min-h-[852px] h-[80dvh]">
                  <FormStartPage.TemplateRenderer
                    name={template_id}
                    meta={campaign}
                    lang={lang}
                  />
                </div>
              </SandboxWrapper>
            </div>
          </div>
        </FormEditorAgentThemeProvider>
      </ViewportRoot>
    </>
  );
}

function PropertiesEditSheet({ ...props }: React.ComponentProps<typeof Sheet>) {
  const { changeRootProps, rootProperties, rootProps } =
    useRootTemplateInstanceNode("page");
  const [state, dispatch] = useEditorState();

  // const { uploadPublic } = useDocumentAssetUpload();
  // const debouncedRichTextHtmlChange = useDebounceCallback(
  //   (editor: BlockNoteEditor<any>, content: Block[]) => {
  //     editor.blocksToHTMLLossy(content).then((html) => {
  //       changeRootProps("body_html", html);
  //     });
  //   },
  //   300
  // );

  const {
    form: { campaign },
  } = state;

  const keys = Object.keys(rootProperties);

  return (
    <Sheet {...props}>
      <SheetContent className="flex flex-col xl:w-[600px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none p-0">
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
              <Card>
                <Collapsible>
                  <CollapsibleTrigger>
                    <CardHeader>
                      <Label>
                        About This Campaign
                        <ArrowRightIcon className="inline ms-2" />
                      </Label>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
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
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </div>
            <div className="w-full grid gap-4">
              {keys.map((key) => {
                const def = rootProperties[key];

                const change = (value: any) => {
                  changeRootProps(key, value);
                };

                const value = rootProps[key];
                const label = def.title || key;

                return (
                  <div key={key} className="grid gap-2">
                    <Label>{label}</Label>
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
    case "richtext": {
      return (
        <CMSRichText
          value={value}
          uploader={uploadPublic}
          onValueChange={onValueChange}
          placeholder={"Enter text here"}
          autofocus={true}
          disabled={false}
        />
      );
    }
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
          // TODO: currently, video and image fields accepts array value
          value={value as any}
          // TODO: currently, video and image fields accepts array value
          onValueChange={(assets) => {
            // FIXME: match signature
            onValueChange(assets);
          }}
        />
      );
    case "video":
      return (
        <CMSVideoAssetField
          uploader={uploadPublic}
          // TODO: currently, video and image fields accepts array value
          value={value as any}
          // TODO: currently, video and image fields accepts array value
          onValueChange={(asset) => {
            // FIXME: match signature
            onValueChange(asset);
          }}
        />
      );
    case "array": {
      // TODO: we don't support array yet, it only supports 1 item
      const t = definition.items.type;

      if (t === "video" || t === "image") {
        return (
          <PropertyField
            name={name}
            definition={
              {
                ...definition,
                type: t,
              } as grida.program.schema.PropertyDefinition
            }
            // TODO: currently, video and image fields accepts array value
            value={value}
            // TODO: currently, video and image fields accepts array value
            onValueChange={(v) => {
              onValueChange(v);
            }}
          />
        );
      } else {
        return (
          <PropertyField
            name={name}
            definition={
              {
                ...definition,
                type: t,
              } as grida.program.schema.PropertyDefinition
            }
            value={value?.[0]}
            onValueChange={(v) => {
              onValueChange([v]);
            }}
          />
        );
      }
    }
    default:
      return (
        <Input disabled placeholder={`Unsupported type: ${definition.type}`} />
      );
  }
}
