import React, {
  forwardRef,
  memo,
  useCallback,
  useState,
  ReactNode,
} from "react";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import "@editor-ui/theme";
import { TreeView } from "@editor-ui/hierarchy";
import { PlusIcon, DotsHorizontalIcon, FileIcon } from "@radix-ui/react-icons";
import { Spacer } from "@editor-ui/spacer";
import { withSeparatorElements } from "@editor-ui/utils";
import { PageType } from "./page-type";
import { PageMenuItemType } from "./page-menu-item-type";

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
  forwardRef(function (
    {
      name,
      selected,
      onHoverChange,
      onAddClick,
      onMenuClick,
      onClickChevron,
      onPress,
      onDoubleClick,
      onClick,
      children,
      ...props
    }: TreeView.TreeRowProps<PageMenuItemType> & {
      name: string;
      selected: boolean;
      onAddClick: () => void;
      onMenuClick: () => void;
      children?: ReactNode;
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
      // @ts-ignore
      <TreeView.Row<PageMenuItemType>
        ref={forwardedRef}
        onHoverChange={handleHoverChange}
        selected={selected}
        disabled={false}
        onPress={onPress}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        {...props}
      >
        {withSeparatorElements(
          [
            // @ts-ignore
            <TreeView.RowTitle>{name}</TreeView.RowTitle>,
            hovered && (
              <>
                <DotsHorizontalIcon onClick={onMenuClick} />
                <Spacer.Horizontal size={12} />
                <PlusIcon onClick={onAddClick} />
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
