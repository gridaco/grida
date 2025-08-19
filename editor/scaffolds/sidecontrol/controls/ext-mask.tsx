import { Button } from "@/components/ui-editor/button";
import { MaskOffIcon } from "@radix-ui/react-icons";

export function MaskControl({ disabled }: { disabled?: boolean }) {
  return (
    <Button variant="ghost" size="icon" disabled={disabled}>
      <MaskOffIcon />
    </Button>
  );
}
