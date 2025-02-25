import {
  CodeIcon,
  DividerHorizontalIcon,
  HeadingIcon,
  ImageIcon,
  PlusCircledIcon,
  ReaderIcon,
  SectionIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import type { FormBlockType } from "@/types";

export function BlockTypeIcon({
  type,
  className,
}: {
  type: FormBlockType;
  className?: string;
}) {
  const props = {
    className,
  };

  switch (type) {
    case "section":
      return <SectionIcon {...props} />;
    case "field":
      return <PlusCircledIcon {...props} />;
    case "image":
      return <ImageIcon {...props} />;
    case "video":
      return <VideoIcon {...props} />;
    case "html":
      return <CodeIcon {...props} />;
    case "pdf":
      return <ReaderIcon {...props} />;
    case "divider":
      return <DividerHorizontalIcon {...props} />;
    case "header":
      return <HeadingIcon {...props} />;
    default:
      return null;
  }
}
