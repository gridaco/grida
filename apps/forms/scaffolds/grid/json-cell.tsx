import Editor from "@monaco-editor/react";
import * as Popover from "@radix-ui/react-popover";

export function JsonEditCell() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button>Open</button>
      </Popover.Trigger>
      <Popover.PopoverPortal>
        <Popover.Content asChild>
          <Editor
            theme="vs-dark"
            width={300}
            height={400}
            defaultLanguage="json"
          />
        </Popover.Content>
      </Popover.PopoverPortal>
    </Popover.Root>
  );
}
