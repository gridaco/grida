import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";
import { useState } from "react";

export function DescriptionDialog({
  defaultValue,
  onValueCommit,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  defaultValue?: string;
  onValueCommit?: (value: string) => void;
}) {
  const [value, setValue] = useState<string>(defaultValue ?? "");

  const onDone = () => {
    onValueCommit?.(value);
    props.onOpenChange?.(false);
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Event Description</DialogTitle>
          <DialogDescription className="sr-only">
            Event Description Content
          </DialogDescription>
        </DialogHeader>
        <MinimalTiptapEditor
          output="html"
          value={value}
          onChange={(newValue) => setValue(newValue as string)}
        />
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
