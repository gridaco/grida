import {
  FrameIcon,
  BoxIcon,
  ComponentInstanceIcon,
  ImageIcon,
  TextIcon,
  TransformIcon,
  CircleIcon,
  Component1Icon,
  GroupIcon,
} from "@radix-ui/react-icons";
import { SquaresUniteIcon } from "lucide-react";

const nodeTypeIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  DOCUMENT: FrameIcon,
  CANVAS: FrameIcon,
  FRAME: FrameIcon,
  SECTION: FrameIcon,
  GROUP: GroupIcon,
  RECTANGLE: BoxIcon,
  ROUNDED_RECTANGLE: BoxIcon,
  ELLIPSE: CircleIcon,
  TEXT: TextIcon,
  SHAPE_WITH_TEXT: TextIcon,
  VECTOR: TransformIcon,
  LINE: TransformIcon,
  STAR: TransformIcon,
  REGULAR_POLYGON: TransformIcon,
  BOOLEAN_OPERATION: SquaresUniteIcon,
  SYMBOL: Component1Icon,
  INSTANCE: ComponentInstanceIcon,
  MEDIA: ImageIcon,
};

/**
 * Icon component for Figma node types
 * Maps Figma Kiwi node types to appropriate icons
 */
export function NodeTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = nodeTypeIconMap[type] || BoxIcon;
  const props = { className: className || "size-4" };
  return <Icon {...props} />;
}
