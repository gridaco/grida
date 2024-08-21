import { useState } from "react";

export function useDialogState<T = any>() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<T>();
  const openDialog = () => setOpen(true);
  const closeDialog = () => setOpen(false);

  return {
    open,
    setOpen,
    onOpenChange: setOpen,
    openDialog,
    closeDialog,
    data,
    setData,
  };
}
