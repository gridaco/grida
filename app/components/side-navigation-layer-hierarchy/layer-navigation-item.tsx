import React, { forwardRef, memo, useCallback, useState } from "react";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import "@editor-ui/theme";
import { TreeView } from "@editor-ui/hierarchy";
import {
  ArrowDownIcon,
  CircleIcon,
  Component1Icon,
  ComponentInstanceIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  FrameIcon,
  GroupIcon,
  ImageIcon,
  LockClosedIcon,
  LockOpen1Icon,
  MaskOnIcon,
  SquareIcon,
  TextIcon,
} from "@radix-ui/react-icons";
import { Spacer } from "@editor-ui/spacer";
import { withSeparatorElements } from "@editor-ui/utils";

export const IconContainer = styled.span(({ theme }) => ({
  color: theme.colors.mask,
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
}));

type LayerType = string;

type LayerListItem = {
  type: LayerType;
  id: string;
  name: string;
  depth: number;
  expanded: boolean;
  selected: boolean;
  visible: boolean;
  hasClippingMask: boolean;
  shouldBreakMaskChain: boolean;
  isWithinMaskChain: boolean;
  isLocked: boolean;
};

export const LayerIcon = memo(function LayerIcon({
  type,
  selected,
  variant,
}: {
  type: LayerType;
  selected?: boolean;
  variant?: "primary";
}) {
  const colors = useTheme().colors;

  const color =
    variant && !selected
      ? colors[variant]
      : selected
      ? colors.iconSelected
      : colors.icon;

  switch (type) {
    case "rectangle":
      return <SquareIcon color={color} />;
    case "oval":
      return <CircleIcon color={color} />;
    case "text":
      return <TextIcon color={color} />;
    case "artboard":
      return <FrameIcon color={color} />;
    case "symbolMaster":
      return <Component1Icon color={color} />;
    case "symbolInstance":
      return <ComponentInstanceIcon color={color} />;
    case "group":
      return <GroupIcon color={color} />;
    case "bitmap":
      return <ImageIcon color={color} />;
    default:
      return null;
  }
});

export const LayerRow = memo(
  forwardRef(function LayerRow(
    {
      name,
      selected,
      visible,
      isWithinMaskChain,
      onHoverChange,
      onChangeVisible,
      onChangeIsLocked,
      isLocked,
      ...props
    }: TreeView.TreeRowProps<LayerMenuItemType> & {
      name: string;
      selected: boolean;
      visible: boolean;
      isWithinMaskChain: boolean;
      isLocked: boolean;
      onChangeVisible: (visible: boolean) => void;
      onChangeIsLocked: (isLocked: boolean) => void;
    },
    forwardedRef: any
  ) {
    const [hovered, setHovered] = useState(false);

    const handleHoverChange = useCallback(
      (hovered: boolean) => {
        onHoverChange?.(hovered);
        setHovered(hovered);
      },
      [onHoverChange]
    );

    const handleSetVisible = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onChangeVisible(true);
      },
      [onChangeVisible]
    );

    const handleSetHidden = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onChangeVisible(false);
      },
      [onChangeVisible]
    );

    const handleSetLocked = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onChangeIsLocked(true);
      },
      [onChangeIsLocked]
    );

    const handleSetUnlocked = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onChangeIsLocked(false);
      },
      [onChangeIsLocked]
    );

    return (
      <TreeView.Row<LayerMenuItemType>
        ref={forwardedRef}
        onHoverChange={handleHoverChange}
        selected={selected}
        disabled={!visible}
        {...props}
      >
        {withSeparatorElements(
          [
            <TreeView.RowTitle>{name}</TreeView.RowTitle>,
            isLocked ? (
              <LockClosedIcon onClick={handleSetUnlocked} />
            ) : hovered ? (
              <LockOpen1Icon onClick={handleSetLocked} />
            ) : null,
            !visible ? (
              <EyeClosedIcon onClick={handleSetVisible} />
            ) : hovered ? (
              <EyeOpenIcon onClick={handleSetHidden} />
            ) : isLocked ? (
              <Spacer.Horizontal size={15} />
            ) : null,
          ],
          <Spacer.Horizontal size={6} />
        )}
      </TreeView.Row>
    );
  })
);

export type LayerMenuItemType =
  | "selectAll"
  | "duplicate"
  | "group"
  | "ungroup"
  | "delete"
  | "createSymbol"
  | "detachSymbol"
  | "useAsMask"
  | "ignoreMasks"
  | "lock"
  | "unlock"
  | "hide"
  | "show";
