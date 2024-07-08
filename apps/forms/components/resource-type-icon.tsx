import { DotIcon, FileIcon, HomeIcon } from "@radix-ui/react-icons";
import {
  FolderDotIcon,
  FilePenLineIcon,
  FileSlidersIcon,
  PanelsTopLeftIcon,
} from "lucide-react";
import { SupabaseLogo } from "./logos";

export function ResourceTypeIcon({
  type,
  className,
}: {
  type: "home" | "project" | "form" | "form-x-supabase";
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
    case "form":
      return <FileSlidersIcon {...props} />;
    case "form-x-supabase":
      return <SupabaseLogo {...props} />;
    default:
      return null;
  }
}
