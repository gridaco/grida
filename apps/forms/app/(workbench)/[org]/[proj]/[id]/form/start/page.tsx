"use client";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { SideControl } from "@/scaffolds/sidecontrol";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { cn } from "@/utils";
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
import { useDebounceCallback, useStep } from "usehooks-ts";
import { useDocument } from "@/scaffolds/editor/use";
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

function useStartPageTemplateEditor() {
  return useDocument("form/startpage");
}

export default function FormStartEditPage() {
  const [state, dispatch] = useEditorState();

  useSyncFormAgentStartPage();

  const {
    documents: { "form/startpage": startpage },
  } = state;

  return (
    <main className="h-full flex flex-1 w-full">
      <AgentThemeProvider>
        {startpage ? <StartPageEditor /> : <SetupStartPage />}
      </AgentThemeProvider>
      <aside className="hidden lg:flex h-full">
        <SideControl />
      </aside>
    </main>
  );
}

function SetupStartPage() {
  const [state, dispatch] = useEditorState();
  const dialog = useDialogState("browse-start-page-templates");

  const setupStartPage = useCallback(
    (template_id: string) => {
      dispatch({
        type: "editor/form/startpage/init",
        startpage: { template_id, data: {} },
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

  const [state, dispatch] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = state;

  const { document } = useStartPageTemplateEditor();

  return (
    <>
      <PropertiesEditSheet open={edit} onOpenChange={setEdit} />

      <div className="w-full px-10 overflow-scroll">
        <div className="w-full mx-auto my-20 max-w-sm xl:max-w-4xl z-[-999]">
          <SandboxWrapper
            className="hover:outline hover:outline-2 hover:outline-workbench-accent-sky rounded-2xl shadow-2xl border overflow-hidden"
            onDoubleClick={() => {
              setEdit(true);
            }}
          >
            <div className="w-full min-h-[852px] h-[80dvh]">
              <FormStartPage.Renderer
                template_id={document.template.template_id}
                data={document.template.properties}
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
  const { changeRootProperties, rootProperties } = useStartPageTemplateEditor();
  const [state, dispatch] = useEditorState();

  const { uploadPublic } = useDocumentAssetUpload();

  const debouncedRichTextHtmlChange = useDebounceCallback(
    (editor: BlockNoteEditor<any>, content: Block[]) => {
      editor.blocksToHTMLLossy(content).then((html) => {
        changeRootProperties("body_html", html);
      });
    },
    300
  );

  const {
    form: { campaign },
  } = state;

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
              <Label>About This Campaign</Label>
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
                        <TableCell>{campaign.scheduling_tz ?? "-"}</TableCell>
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
            </div>
            <div className="grid gap-2">
              <Label>Media</Label>
              <CMSImageAssetField
                uploader={uploadPublic}
                value={rootProperties.media as any}
                onValueChange={(asset) => {
                  changeRootProperties("media", asset);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Background Video</Label>
              <CMSVideoAssetField
                uploader={uploadPublic}
                value={rootProperties.background as any}
                onValueChange={(asset) => {
                  changeRootProperties("background", asset);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input
                // TODO: support tokens
                value={rootProperties.title as string}
                onChange={(e) => {
                  changeRootProperties("title", e.target.value);
                }}
                placeholder="Enter your Campaign Title"
              />
            </div>
            <div className="grid gap-2">
              <Label>Excerpt</Label>
              <Input
                // TODO: support tokens
                value={rootProperties.excerpt as string}
                onChange={(e) => {
                  changeRootProperties("excerpt", e.target.value);
                }}
                placeholder="excerpt"
              />
            </div>
            <div className="grid gap-2">
              <Label>Content</Label>
              <CMSRichText
                defaultValue={rootProperties.body as any}
                onContentChange={(editor, content) => {
                  changeRootProperties("body", content);
                  debouncedRichTextHtmlChange(editor, content);
                }}
              />
            </div>
          </div>
          <div className="h-40" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
