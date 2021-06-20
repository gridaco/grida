import React, { forwardRef, memo, useCallback, useState } from "react";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import "@editor-ui/theme";
import { TreeView } from "@editor-ui/hierarchy";
import { PlusIcon, DotsHorizontalIcon, FileIcon } from "@radix-ui/react-icons";
import { Spacer } from "@editor-ui/spacer";
import { withSeparatorElements } from "@editor-ui/utils";
import { PageType } from "./page-type";

export const IconContainer = styled.span(({ theme }) => ({
  color: theme.colors.mask,
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
}));

export const PageIcon = memo(function LayerIcon({
  type,
  selected,
  variant,
}: {
  type: PageType;
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
    case "page":
      return <FileIcon color={color} />;
    default:
      return null;
  }
});

export const PageRow = memo(
  forwardRef(function LayerRow(
    {
      name,
      selected,
      onHoverChange,
      ...props
    }: TreeView.TreeRowProps<PageMenuItemType> & {
      name: string;
      selected: boolean;
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

    return (
      <TreeView.Row<PageMenuItemType>
        ref={forwardedRef}
        onHoverChange={handleHoverChange}
        selected={selected}
        disabled={false}
        {...props}
      >
        {withSeparatorElements(
          [
            <TreeView.RowTitle>{name}</TreeView.RowTitle>,
            hovered && (
              <>
                <DotsHorizontalIcon onClick={() => {}} />
                <Spacer.Horizontal size={12} />
                <PlusIcon onClick={() => {}} />
              </>
            ),
          ],
          <Spacer.Horizontal size={6} />
        )}
      </TreeView.Row>
    );
  })
);

export type PageMenuItemType =
  /**
   * duplicate page
   */
  | "duplicate"
  /**
   * delete page
   */
  | "delete";
