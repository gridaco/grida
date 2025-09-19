import { Button } from "@/components/ui-editor/button";
import { MaskOffIcon } from "@radix-ui/react-icons";
import React from "react";

export function MaskControl({ ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon" {...props}>
      <MaskOffIcon />
    </Button>
  );
}
