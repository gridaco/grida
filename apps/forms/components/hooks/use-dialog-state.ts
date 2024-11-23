import { useState } from "react";

export function useDialogState<T = any>(
  name = "dialog",
  config?: { refreshkey?: boolean; defaultOpen?: boolean }
) {
  const [open, setOpen] = useState<boolean>(config?.defaultOpen ?? false);
  const [key, setKey] = useState(0);
  const [data, setData] = useState<T>();
  const openDialog = (data?: T | Event) => {
    setOpen(true);
    setData(data instanceof Event ? undefined : data);
    if (config?.refreshkey) setKey((prev) => prev + 1);
  };
  const closeDialog = () => setOpen(false);

  return {
    refreshkey: name + key,
    open,
    setOpen,
    onOpenChange: setOpen,
    openDialog,
    closeDialog,
    data,
    setData,
  };
}
