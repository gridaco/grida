"use client";

import React, { useMemo } from "react";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil2Icon } from "@radix-ui/react-icons";
import { toast } from "sonner";

export function SiteDomainsSection({
  name,
  onDomainNameChange,
}: {
  name: string;
  onDomainNameChange: (name: string) => Promise<boolean>;
}) {
  const updateNameDialog = useDialogState("update-domain-name", {
    refreshkey: true,
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <div className="grid gap-2">{/*  */}</div>
      </div>
      <div className="w-full flex items-center justify-between">
        <Badge variant="secondary">
          {name}
          .grida.site
        </Badge>
        <Button
          onClick={updateNameDialog.openDialog}
          variant="ghost"
          size="icon"
        >
          <Pencil2Icon />
        </Button>
      </div>

      <UpdateNameDialog
        key={updateNameDialog.refreshkey}
        {...updateNameDialog.props}
        onSubmit={onDomainNameChange}
        defaultValues={{
          name: name,
        }}
      />
    </div>
  );
}

function UpdateNameDialog({
  onSubmit,
  defaultValues,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onSubmit: (name: string) => Promise<boolean>;
  defaultValues: {
    name: string;
  };
}) {
  const [name, setName] = React.useState(defaultValues.name);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmitHandler = async () => {
    setBusy(true);
    const ok = await onSubmit(name);
    setBusy(false);
    if (ok) {
      toast.success("Domain name updated successfully");
      props.onOpenChange?.(false);
    } else {
      setError(
        "This domain is either already taken or not allowed. Please try a different name using only letters, numbers, or dashes."
      );
    }
  };

  const dirty = useMemo(() => {
    return name !== defaultValues.name;
  }, [name, defaultValues.name]);

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update existing domain</DialogTitle>
          <DialogDescription>
            This update will affect all live sites currently using this domain
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 flex flex-col gap-2">
          <div className="flex h-9 items-center border rounded-md px-3 py-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-muted">
            <Input
              className="border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0 shadow-none"
              placeholder="your-domain"
              disabled={busy}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            <span className="ml-2 text-muted-foreground text-sm">
              .grida.site
            </span>
          </div>
          <p
            data-error={!!error}
            className="text-xs text-muted-foreground data-[error=true]:text-destructive"
          >
            {error
              ? error
              : "lowercase letters, numbers, and dashes are allowed"}
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onSubmitHandler} disabled={!dirty || busy} size="sm">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
