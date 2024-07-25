import { DotIcon, FileIcon, HomeIcon } from "@radix-ui/react-icons";
import {
  FolderDotIcon,
  FilePenLineIcon,
  FileSlidersIcon,
  PanelsTopLeftIcon,
  GalleryHorizontalIcon,
  FileBarChart2,
} from "lucide-react";
import { SupabaseLogo } from "./logos";

export function ResourceTypeIcon({
  type,
  className,
}: {
  type: "home" | "project" | "form" | "form-x-supabase" | "v0_form" | "v0_site";
  className?: string;
}) {
  const props = {
    className,
  };

  switch (type) {
    case "home":
      return <HomeIcon {...props} />;
    case "project":
      return <FolderDotIcon {...props} />;
    case "v0_form":
    case "form":
      return <FileBarChart2 {...props} />;
    case "v0_site":
      return <GalleryHorizontalIcon {...props} />;
    case "form-x-supabase":
      return <SupabaseLogo {...props} />;
    default:
      return null;
  }
}
