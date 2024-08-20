import { useState } from "react";

export function useDialogState() {
  const [open, setOpen] = useState(false);
  const openDialog = () => setOpen(true);
  const closeDialog = () => setOpen(false);

  return {
    open,
    setOpen,
    onOpenChange: setOpen,
    openDialog,
    closeDialog,
  };
}
