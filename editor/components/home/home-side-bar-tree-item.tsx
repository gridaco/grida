import React, {
  forwardRef,
  memo,
  useCallback,
  useState,
  ReactNode,
} from "react";
import { TreeView } from "@editor-ui/hierarchy";
import { Spacer } from "@editor-ui/spacer";
import { withSeparatorElements } from "@editor-ui/utils";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import { DotsHorizontalIcon, FileIcon } from "@radix-ui/react-icons";
import "@editor-ui/theme";

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
      onMenuClick,
      onClickChevron,
      onPress,
      onDoubleClick,
      onClick,
      children,
      ...props
    }: TreeView.TreeRowProps<""> & {
      name: string;
      selected: boolean;
      onMenuClick: () => void;
      children?: ReactNode;
    },
    ref: any
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
        ref={ref}
        onHoverChange={handleHoverChange}
        selected={selected}
        disabled={false}
        onPress={onPress}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onClickChevron={onClickChevron}
        {...props}
      >
        {withSeparatorElements(
          [
            <TreeView.RowTitle>{name}</TreeView.RowTitle>,
            // hovered && (
            //   <>
            //     <DotsHorizontalIcon onClick={onMenuClick} />
            //     <Spacer.Horizontal size={12} />
            //     {/* <PlusIcon onClick={onAddClick} /> */}
            //   </>
            // ),
          ],
          <Spacer.Horizontal size={6} />
        )}
        {children}
      </TreeView.Row>
    );
  })
);
