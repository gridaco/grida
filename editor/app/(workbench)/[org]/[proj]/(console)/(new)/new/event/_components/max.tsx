"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

interface CapacityDialogProps {
  defaultCapacity?: number;
  title?: string;
  description?: string;
  onSetLimit?: (max: number | null) => void;
}

export function MaxDialog({
  defaultCapacity = 50,
  title = "Attendance Limit",
  description = "Registration will close automatically when the limit is reached. Only confirmed attendees count towards this limit.",
  onSetLimit,
  ...props
}: React.ComponentProps<typeof Dialog> & CapacityDialogProps) {
  const [capacity, setCapacity] = useState(defaultCapacity);

  const handleSetLimit = () => {
    onSetLimit?.(capacity);
    props.onOpenChange?.(false);
  };

  const handleRemoveLimit = () => {
    onSetLimit?.(null);
    props.onOpenChange?.(false);
  };

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-md">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          <Upload className="size-8 text-muted-foreground" />
        </div>
        <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs">
          {description}
        </DialogDescription>

        <div className="space-y-6 py-4">
          <Field>
            <FieldLabel htmlFor="capacity">Maximum Attendees</FieldLabel>
            <Input
              id="capacity"
              type="number"
              value={capacity}
              onChange={(e) =>
                setCapacity(Number.parseInt(e.target.value) || 0)
              }
              min={1}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="default" className="flex-1" onClick={handleSetLimit}>
            Apply Limit
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleRemoveLimit}
          >
            Remove Limit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
