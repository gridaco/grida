import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function CanvasFloatingToolbar() {
  return (
    <>
      <ViewportToggle />
    </>
  );
}

export function ViewportToggle() {
  return (
    <ToggleGroup type="single">
      <ToggleGroupItem value="1"></ToggleGroupItem>
      <ToggleGroupItem value="2"></ToggleGroupItem>
    </ToggleGroup>
  );
}
