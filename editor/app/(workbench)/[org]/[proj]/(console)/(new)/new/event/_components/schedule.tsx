import { Dialog, DialogContent } from "@/components/ui/dialog";
import React from "react";

export function ScheduleDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      <DialogContent></DialogContent>
    </Dialog>
  );
}
