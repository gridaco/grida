"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useState } from "react";
import "./styles.css";
// import { BlockNoteView } from "@blocknote/shadcn";
// https://github.com/TypeCellOS/BlockNote/issues/880
// importing this will break border in darkmode for existing shadcn components & classes
// import "@blocknote/shadcn/style.css";
// import "@blocknote/react/style.css";
// import * as Tooltip from "@/components/ui/tooltip";
// import * as Badge from "@/components/ui/badge";
// import * as Button from "@/components/ui/button";
// import * as Card from "@/components/ui/card";
// import * as Popover from "@/components/ui/popover";
// import * as Select from "@/components/ui/select";
// import * as Tabs from "@/components/ui/tabs";
// import * as Toggle from "@/components/ui/toggle";
// import * as Input from "@/components/ui/input";
// import * as Label from "@/components/ui/label";
// import * as DropdownMenu from "@/components/ui/dropdown-menu";
// shadCNComponents={{
//   Badge,
//   Button,
//   Card,
//   DropdownMenu,
//   Input,
//   Label,
//   Popover,
//   Select,
//   Tabs,
//   Toggle,
//   Tooltip,
// }}

export function RichTextEditorField({
  name,
  required,
}: {
  name: string;
  required?: boolean;
}) {
  const [txtjsonvalue, settxtjsonvalue] = useState<string | undefined>(
    undefined
  );

  const editor = useCreateBlockNote({
    _tiptapOptions: {
      onUpdate: ({ editor }) => {
        // TODO: consider adding a debounce here
        const json = editor.getJSON();
        settxtjsonvalue(JSON.stringify(json));
      },
    },
  });

  return (
    <div className="shadow-sm h-full w-full rounded-md border border-input bg-transparent text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
      <input
        type="text"
        name={name}
        value={txtjsonvalue}
        required={required}
        className="sr-only"
      />
      <BlockNoteView
        data-theming-ui-css-variables
        editor={editor}
        className="min-h-[60px] py-10 h-full w-full bg-transparent placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}
