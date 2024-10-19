"use client";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { SideControl } from "@/scaffolds/sidecontrol";
import dummy from "@/theme/templates/formstart/data/01.dummy.json";
import React, { useState } from "react";
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
import FormStartPage from "@/theme/templates/formstart/005/page";
import { useEditorState } from "@/scaffolds/editor";

export default function FormStartEditPage() {
  const [state] = useEditorState();

  const {
    form: { campaign },
    theme: { lang },
  } = state;

  const [edit, setEdit] = useState(false);

  return (
    <main className="h-full flex flex-1 w-full">
      <EditSheet open={edit} onOpenChange={setEdit} />
      <div className="w-full px-10 overflow-scroll">
        <AgentThemeProvider>
          <div className="w-full mx-auto my-20 max-w-sm xl:max-w-4xl z-[-999]">
            <SandboxWrapper
              className="hover:outline hover:outline-2 hover:outline-workbench-accent-sky rounded-2xl shadow-2xl border overflow-hidden"
              onDoubleClick={() => {
                setEdit(true);
              }}
            >
              <div className="w-full min-h-[852px] h-[80dvh]">
                <FormStartPage data={dummy} meta={campaign} lang={lang} />
              </div>
            </SandboxWrapper>
          </div>
        </AgentThemeProvider>
      </div>
      <aside className="hidden lg:flex h-full">
        <SideControl />
      </aside>
    </main>
  );
}

function SandboxWrapper({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore link clicks
    if ((e.target as HTMLElement).tagName === "A") {
      e.preventDefault();
    }

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

function EditSheet({ ...props }: React.ComponentProps<typeof Sheet>) {
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
                  <TableCell>ON</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Scheduling Time Zone</TableCell>
                  <TableCell>Asia/Tokyo</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Scheduling Open At</TableCell>
                  <TableCell>Asia/Tokyo</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Scheduling Close At</TableCell>
                  <TableCell>Asia/Tokyo</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Max Responses in total</TableCell>
                  <TableCell>100</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Max Responses per user</TableCell>
                  <TableCell>1</TableCell>
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
            <Input placeholder="Enter your Campaign Title" />
          </div>
          <div className="grid gap-2">
            <Label>Content</Label>
            <RichTextEditorField />
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
