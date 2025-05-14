import React, { forwardRef, memo, useCallback, ReactNode } from "react";
import { TreeView } from "@editor-ui/hierarchy";
import { Spacer } from "@editor-ui/spacer";
import { withSeparatorElements } from "@editor-ui/utils";
import "@editor-ui/theme";
import { ReflectSceneNodeType } from "@design-sdk/figma-node";
import { SceneNodeIcon } from "@code-editor/node-icons";
import styled, { useTheme } from "@editor-ui/theme";

export const IconContainer = styled.span(({ theme }) => ({
  color: theme.colors.mask,
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
}));

export const LayerIcon = memo(function LayerIcon({
  type,
  selected,
  variant,
}: {
  type: ReflectSceneNodeType;
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

  return <SceneNodeIcon type={type} color={color} />;
});

export const HierarchyRow = memo(
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
      // @ts-ignore
      <TreeView.Row<PageMenuItemType>
        ref={ref}
        onHoverChange={handleHoverChange}
        hovered={hovered}
        selected={selected}
        disabled={false}
        onPress={onPress}
        onClick={onClick}
        onClickChevron={onClickChevron}
        onDoubleClick={onDoubleClick}
        {...props}
      >
        {withSeparatorElements(
          [
            <TreeView.RowTitle>{name}</TreeView.RowTitle>,
            hovered && (
              <>
                {/* <DotsHorizontalIcon onClick={onMenuClick} /> */}
                {/* <Spacer.Horizontal size={12} /> */}
                {/* <PlusIcon onClick={onAddClick} /> */}
              </>
            ),
          ],
          <Spacer.Horizontal size={6} />
        )}
        {children}
      </TreeView.Row>
    );
  })
);
