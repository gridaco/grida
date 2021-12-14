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
import "@editor-ui/theme";
import { ReflectSceneNodeType } from "@design-sdk/figma-node";
import {
  FrameIcon,
  DotsHorizontalIcon,
  FileIcon,
  TextIcon,
  GroupIcon,
  ComponentInstanceIcon,
  Component1Icon,
  BoxIcon,
  CircleIcon,
  ImageIcon,
} from "@radix-ui/react-icons";

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

  switch (type as ReflectSceneNodeType) {
    case ReflectSceneNodeType.group:
      return <GroupIcon color={color} />;
    case ReflectSceneNodeType.component:
      return <Component1Icon color={color} />;
    case ReflectSceneNodeType.instance:
      return <ComponentInstanceIcon />;
    case ReflectSceneNodeType.text:
      return <TextIcon color={color} />;
    case ReflectSceneNodeType.frame:
      return <FrameIcon color={color} />;
    case ReflectSceneNodeType.ellipse:
      return <CircleIcon color={color} />;
    case ReflectSceneNodeType.rectangle:
      return <BoxIcon color={color} />;
    case ReflectSceneNodeType.variant_set:
      return <></>;
    case ReflectSceneNodeType.constraint:
      return <></>;
    case ReflectSceneNodeType.line:
      return <></>;
    case ReflectSceneNodeType.vector:
      return <></>;
    case ReflectSceneNodeType.star:
      return <></>;
    case ReflectSceneNodeType.poligon:
      return <></>;
    case ReflectSceneNodeType.boolean_operation:
      return <></>;
    case ReflectSceneNodeType.image:
      return <ImageIcon color={color} />;
    case ReflectSceneNodeType.unknown:
      return <></>;
    default:
      return <></>;
  }
});

export const LayerRow = memo(
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
        onClickChevron={onClickChevron}
        onDoubleClick={onDoubleClick}
        {...props}
      >
        {withSeparatorElements(
          [
            <TreeView.RowTitle>{name}</TreeView.RowTitle>,
            hovered && (
              <>
                <DotsHorizontalIcon onClick={onMenuClick} />
                <Spacer.Horizontal size={12} />
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
