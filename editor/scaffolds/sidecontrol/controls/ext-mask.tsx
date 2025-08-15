import { Button } from "@/components/ui-editor/button";
import { MaskOffIcon } from "@radix-ui/react-icons";

export function MaskControl() {
  return (
    <Button variant="ghost" size="icon">
      <MaskOffIcon />
    </Button>
  );
}
