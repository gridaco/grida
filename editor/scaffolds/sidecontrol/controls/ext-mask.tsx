import { Button } from "@/components/ui-editor/button";
import { Half2Icon } from "@radix-ui/react-icons";
import React from "react";

export function MaskControl({
  active,
  ...props
}: React.ComponentProps<typeof Button> & {
  active?: boolean;
}) {
  return (
    <Button variant="ghost" size="icon" {...props}>
      <Half2Icon
        data-active={active}
        className="data-[active='true']:text-workbench-accent-sky"
      />
    </Button>
  );
}
