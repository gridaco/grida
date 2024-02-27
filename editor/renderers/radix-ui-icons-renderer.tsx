import { CraftRadixIconElement } from "@code-editor/craft/core";
import * as RadixIcons from "@radix-ui/react-icons";

export function RadixIconRenderer({
  target,
}: {
  target: CraftRadixIconElement;
}) {
  const Component = RadixIcons[target.icon];
  return <Component color={target.color} />;
}
