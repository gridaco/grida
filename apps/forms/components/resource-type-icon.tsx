import { DotIcon, FileIcon, HomeIcon } from "@radix-ui/react-icons";
import {
  FolderDotIcon,
  FilePenLineIcon,
  FileSlidersIcon,
  PanelsTopLeftIcon,
  GalleryHorizontalIcon,
  FileBarChart2,
  SettingsIcon,
} from "lucide-react";
import { SupabaseLogo } from "./logos";

export function ResourceTypeIcon({
  type,
  className,
}: {
  type:
    | "folder"
    | "file"
    | "setting"
    | "home"
    | "table"
    | "project"
    | "form"
    | "form-x-supabase"
    | "v0_form"
    | "v0_site";
  className?: string;
}) {
  const props = {
    className,
  };

  switch (type) {
    case "home":
      return <HomeIcon {...props} />;
    case "project":
    case "folder":
      return <FolderDotIcon {...props} />;
    case "file":
      return <FileIcon {...props} />;
    case "table":
      return <PanelsTopLeftIcon {...props} />;
    case "v0_form":
    case "form":
      return <FileBarChart2 {...props} />;
    case "v0_site":
      return <GalleryHorizontalIcon {...props} />;
    case "form-x-supabase":
      return <SupabaseLogo {...props} />;
    case "setting":
      return <SettingsIcon {...props} />;
    default:
      return null;
  }
}
