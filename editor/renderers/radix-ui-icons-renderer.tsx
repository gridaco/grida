import * as RadixIcons from "@radix-ui/react-icons";

export function RadixIconRenderer({ name }: { name: string }) {
  const Component = RadixIcons[name];
  return <Component />;
}
