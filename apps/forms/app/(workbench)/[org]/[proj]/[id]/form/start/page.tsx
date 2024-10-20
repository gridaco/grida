"use client";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { SideControl } from "@/scaffolds/sidecontrol";
import dummy from "@/theme/templates/formstart/data/01.dummy.json";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet-without-overlay";
import { RichTextEditorField } from "@/components/formfield/richtext-field";
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
import { FileUploadField } from "@/components/formfield/file-upload-field";
import { cn } from "@/utils";
import FormStartPage001 from "@/theme/templates/formstart/001/page";
import FormStartPage002 from "@/theme/templates/formstart/002/page";
import FormStartPage003 from "@/theme/templates/formstart/003/page";
import FormStartPage004 from "@/theme/templates/formstart/004/page";
import FormStartPage005 from "@/theme/templates/formstart/005/page";
import { useEditorState } from "@/scaffolds/editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { useStep } from "usehooks-ts";
import { motion } from "framer-motion";
import assert from "assert";
import { useDocument } from "@/scaffolds/editor/use";

function useStartPageTemplateEditor() {
  return useDocument("form/startpage");
}

export default function FormStartEditPage() {
  const [state, dispatch] = useEditorState();

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

const startpage_templates = [
  {
    id: "001",
    name: "001",
    component: FormStartPage001,
  },
  {
    id: "002",
    name: "002",
    component: FormStartPage002,
  },
  {
    id: "003",
    name: "003",
    component: FormStartPage003,
  },
  {
    id: "004",
    name: "004",
    component: FormStartPage004,
  },
  {
    id: "005",
    name: "005",
    component: FormStartPage005,
  },
];

function BrowseStartPageTemplatesDialog({
  onValueCommit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onValueCommit?: (value: string) => void;
}) {
  const [state] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = state;

  const [
    step,
    { goToNextStep, goToPrevStep, canGoToNextStep, canGoToPrevStep },
  ] = useStep(startpage_templates.length);

  useEffect(() => {
    setSelection(startpage_templates[step - 1].id);
  }, [step]);

  const [selection, setSelection] = useState<string>("001");

  const template = startpage_templates.find((t) => t.id === selection)!;

  return (
    <Dialog {...props}>
      <DialogContent className="w-dvw h-dvh max-w-none p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 w-full relative">
          <DialogTitle>Browse Templates</DialogTitle>
          <div className="absolute top-2 flex w-full justify-center">
            <header className="flex w-min items-center justify-center gap-4 px-4 py-2 border rounded">
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoToPrevStep}
                onClick={goToPrevStep}
              >
                <ArrowLeftIcon />
              </Button>
              <h6 className="text-lg font-bold">{template.name}</h6>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoToNextStep}
                onClick={goToNextStep}
              >
                <ArrowRightIcon />
              </Button>
            </header>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto w-full p-4">
          {template && (
            <motion.div
              key={template.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="mx-auto max-w-screen-sm w-full h-full"
            >
              <SandboxWrapper
                className="rounded-2xl shadow-2xl w-full h-full overflow-hidden"
                onClick={() => {
                  setSelection?.(template.id);
                }}
                onDoubleClick={() => {
                  onValueCommit?.(template.id);
                }}
              >
                <template.component
                  data={{
                    title: "",
                  }}
                  meta={campaign}
                  lang={lang}
                />
              </SandboxWrapper>
            </motion.div>
          )}
        </div>

        <DialogFooter className="p-4">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              disabled={!selection}
              onClick={() => {
                onValueCommit?.(selection!);
              }}
            >
              Use
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartPageEditor() {
  const [edit, setEdit] = useState(false);

  const [state, dispatch] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = state;

  const { document: startpage } = useDocument("form/startpage");

  const Component = useMemo(
    () =>
      startpage_templates.find((t) => t.id === startpage?.template.template_id)
        ?.component,
    [startpage]
  );

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
              {Component && (
                <Component
                  data={startpage.template.properties}
                  meta={campaign}
                  lang={lang}
                />
              )}
            </div>
          </SandboxWrapper>
        </div>
      </div>
    </>
  );
}

function SandboxWrapper({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // ignore all
    e.preventDefault();
    // // Ignore link clicks
    // if ((e.target as HTMLElement).tagName === "A") {
    //   e.preventDefault();
    // }

    props.onClick?.(e);
  };

  return (
    <div
      {...props}
      className={cn("select-none", className)}
      onClick={handleClick}
    >
      {/* <link rel="stylesheet" href="/shadow/editor.css" /> */}
      {children}
    </div>
  );
}

function PropertiesEditSheet({ ...props }: React.ComponentProps<typeof Sheet>) {
  const { changeRootProperties, rootProperties } = useStartPageTemplateEditor();
  const [state, dispatch] = useEditorState();

  const {
    form: { campaign },
  } = state;

  return (
    <Sheet {...props}>
      <SheetContent className="flex flex-col xl:w-[800px] xl:max-w-none sm:w-[500px] sm:max-w-none w-screen max-w-none">
        <SheetHeader>
          <SheetTitle>Page Content</SheetTitle>
          <SheetDescription>
            Edit the content of the page here.
          </SheetDescription>
        </SheetHeader>
        <hr />
        <div className="grid gap-4">
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
                        {campaign.scheduling_open_at ?? "-"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Scheduling Close At</TableCell>
                      <TableCell>
                        {campaign.scheduling_close_at ?? "-"}
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
                  <TableCell>Max Responses per user</TableCell>
                  <TableCell>
                    {campaign.max_form_responses_by_customer ?? "∞"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-2">
            <Label>Media</Label>
            <FileUploadField />
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
            <Label>Content</Label>
            <RichTextEditorField
              // TODO: support tokens
              initialContent={rootProperties.body as any}
              onContentChange={(content) => {
                changeRootProperties("body", content);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label>Register Button Text</Label>
            <Input placeholder="Register" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
