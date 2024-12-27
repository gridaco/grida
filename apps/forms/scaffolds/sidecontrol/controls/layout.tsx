import { grida } from "@/grida";
import type { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

type Layout = grida.program.nodes.i.IFlexContainer["layout"];

export function LayoutControl({
  value,
  onValueChange,
}: {
  value?: TMixed<Layout>;
  onValueChange?: (value: Layout) => void;
}) {
  return (
    <PropertyEnum<Layout>
      placeholder="Display"
      enum={[
        { value: "flow", label: "Normal Flow" },
        { value: "flex", label: "Flex" },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
