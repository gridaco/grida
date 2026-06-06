import { Dialog, DialogContent } from "@app/ui/components/dialog";
import React from "react";

export function ScheduleDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      <DialogContent>TODO</DialogContent>
    </Dialog>
  );
}
