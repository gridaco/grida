import grida from "@grida/schema";
import type { TMixed } from "./utils/types";
import type cg from "@grida/cg";
import { PropertyEnum, PropertyEnumToggle } from "../ui";
import {
  ViewHorizontalIcon,
  ViewNoneIcon,
  ViewVerticalIcon,
  ViewGridIcon,
} from "@radix-ui/react-icons";

type LayoutMode = grida.program.nodes.i.IFlexContainer["layout"];

type PartialLayoutProperties = {
  layoutMode: LayoutMode;
  /**
   * only valid when layout mode is "flex"
   */
  direction?: cg.Axis;
};

type Option = "normal" | "flex-row" | "flex-column";

export function LayoutControl({
  value,
  onValueChange,
}: {
  value?: PartialLayoutProperties;
  onValueChange?: (
    value: PartialLayoutProperties & {
      /**
       * when you need this, we expose internal option value to you.
       */
      key: Option;
    }
  ) => void;
}) {
  const op: Option =
    value?.layoutMode === "flex"
      ? value.direction === "horizontal"
        ? "flex-row"
        : "flex-column"
      : "normal";

  const _onValueChange = (value: Option) => {
    if (value === "normal") {
      onValueChange?.({ layoutMode: "flow", key: value });
    } else if (value === "flex-row") {
      onValueChange?.({
        layoutMode: "flex",
        direction: "horizontal",
        key: value,
      });
    } else if (value === "flex-column") {
      onValueChange?.({
        layoutMode: "flex",
        direction: "vertical",
        key: value,
      });
    }
  };

  return (
    <PropertyEnumToggle<Option>
      enum={[
        { value: "normal", icon: <ViewNoneIcon /> },
        { value: "flex-row", icon: <ViewVerticalIcon /> },
        { value: "flex-column", icon: <ViewHorizontalIcon /> },
        // WILL BE 'GRID'
        // @ts-expect-error grid is not yet supported
        { value: "grid", icon: <ViewGridIcon />, disabled: true },
      ]}
      value={op}
      onValueChange={_onValueChange}
    />
  );
}

export function LayoutModeControl({
  value,
  onValueChange,
}: {
  value?: TMixed<LayoutMode>;
  onValueChange?: (value: LayoutMode) => void;
}) {
  return (
    <PropertyEnum<LayoutMode>
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
