import { useState } from "react";

export function useDialogState<T = any>(config?: { disableKey?: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [data, setData] = useState<T>();
  const openDialog = (data?: T | Event) => {
    setOpen(true);
    setData(data instanceof Event ? undefined : data);
    if (!config?.disableKey) setKey((prev) => prev + 1);
  };
  const closeDialog = () => setOpen(false);

  return {
    key,
    open,
    setOpen,
    onOpenChange: setOpen,
    openDialog,
    closeDialog,
    data,
    setData,
  };
}