import { Dialog } from "@radix-ui/react-dialog";
import React from "react";
import { useState } from "react";

type DialogProps = React.ComponentProps<typeof Dialog>;

export function useDialogState<T = any>(
  name = "dialog",
  config?: { refreshkey?: boolean; defaultOpen?: boolean }
): {
  refreshkey: string;
  props: DialogProps & { data?: T };
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleOpen: () => void;
  openDialog: (data?: T | Event) => void;
  closeDialog: () => void;
  data: T | undefined;
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
} {
  const [open, setOpen] = useState<boolean>(config?.defaultOpen ?? false);
  const [key, setKey] = useState(0);
  const [data, setData] = useState<T>();
  const openDialog = (data?: T | Event) => {
    setOpen(true);
    setData(data instanceof Event ? undefined : data);
    if (config?.refreshkey) setKey((prev) => prev + 1);
  };
  const closeDialog = () => setOpen(false);
  const toggleOpen = () => setOpen((prev) => !prev);

  return {
    refreshkey: name + key,
    props: {
      open,
      onOpenChange: setOpen,
      data,
    },
    data,
    open,
    setOpen,
    toggleOpen,
    openDialog,
    closeDialog,
    setData,
  };
}
