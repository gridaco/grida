import type grida from "@grida/schema";
import {
  FrameIcon,
  BoxIcon,
  ComponentInstanceIcon,
  ImageIcon,
  TextIcon,
  TransformIcon,
  CircleIcon,
  ViewVerticalIcon,
  ViewHorizontalIcon,
  Component1Icon,
  TransparencyGridIcon,
  MixIcon,
  VideoIcon,
  GlobeIcon,
  GroupIcon,
} from "@radix-ui/react-icons";
import { SquaresUniteIcon } from "lucide-react";

export function NodeTypeIcon({
  className,
  node,
}: {
  node: grida.program.nodes.Node;
  className?: string;
}) {
  switch (node.type) {
    case "iframe":
      return <GlobeIcon className={className} />;
    case "richtext":
      return <TextIcon className={className} />;
    case "video":
      return <VideoIcon className={className} />;
    case "template_instance":
      return <MixIcon className={className} />;
    case "container":
      if (node.layout === "flex") {
        switch (node.direction) {
          case "horizontal":
            return <ViewVerticalIcon className={className} />;
          case "vertical":
            return <ViewHorizontalIcon className={className} />;
        }
      }
      return <FrameIcon className={className} />;
    case "component":
      return <Component1Icon className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "text":
      return <TextIcon className={className} />;
    case "instance":
      return <ComponentInstanceIcon className={className} />;
    case "rectangle":
      return <BoxIcon className={className} />;
    case "ellipse":
      return <CircleIcon className={className} />;
    case "svgpath":
    case "line":
    case "vector":
      return <TransformIcon className={className} />;
    case "bitmap":
      return <TransparencyGridIcon className={className} />;
    case "group":
      return <GroupIcon className={className} />;
    case "boolean":
      return <SquaresUniteIcon className={className} />;
  }
  return <BoxIcon className={className} />;
}
