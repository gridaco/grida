import React, { forwardRef, memo, useCallback, ReactNode } from "react";
import { TreeView } from "@editor-ui/hierarchy";
import { Spacer } from "@editor-ui/spacer";
import { withSeparatorElements } from "@editor-ui/utils";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import "@editor-ui/theme";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { FileModuleIcon } from "components/icons";

export const IconContainer = styled.span(({ theme }) => ({
  color: theme.colors.mask,
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
}));

export const FileIcon = memo(function FileIcon({
  type,
  selected,
  variant,
}: {
  type: string;
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

  return <FileModuleIcon type={type} color={color} />;
});

export const FileRow = memo(
  forwardRef(function (
    {
      name,
      selected,
      onHoverChange,
      onMenuClick,
      onClickChevron,
      onPress,
      onDoubleClick,
      onClick,
      children,
      hovered,
      ...props
    }: TreeView.TreeRowProps<""> & {
      name: string;
      selected: boolean;
      onMenuClick: () => void;
      children?: ReactNode;
    },
    ref: any
  ) {
    const handleHoverChange = useCallback(
      (hovered: boolean) => {
        onHoverChange?.(hovered);
      },
      [onHoverChange]
    );

    return (
      <TreeView.Row
        ref={ref}
        onHoverChange={handleHoverChange}
        hovered={hovered}
        selected={selected}
        selectedColor="rgba(255, 255, 255, 0.1)"
        disabled={false}
        onPress={onPress}
        onClick={onClick}
        onClickChevron={onClickChevron}
        onDoubleClick={onDoubleClick}
        {...props}
      >
        <TreeView.RowTitle>{name}</TreeView.RowTitle>
        {children}
      </TreeView.Row>
    );
  })
);
