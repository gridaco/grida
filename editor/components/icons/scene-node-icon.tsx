import React from "react";
import {
  FrameIcon,
  TextIcon,
  GroupIcon,
  ComponentInstanceIcon,
  Component1Icon,
  BoxIcon,
  CircleIcon,
  GridIcon,
  StarIcon,
  ImageIcon,
} from "@radix-ui/react-icons";
import { ReflectSceneNodeType } from "@design-sdk/figma-node";

export function SceneNodeIcon({
  type,
  color,
}: {
  type: ReflectSceneNodeType;
  color?: string;
}) {
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
      return <GridIcon color={color} />;
    case ReflectSceneNodeType.constraint:
      return <></>;
    case ReflectSceneNodeType.line:
      return <></>;
    case ReflectSceneNodeType.vector:
      return <></>;
    case ReflectSceneNodeType.star:
      return <StarIcon color={color} />;
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
}
