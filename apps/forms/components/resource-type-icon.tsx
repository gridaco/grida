import { AvatarIcon, FileIcon, HomeIcon } from "@radix-ui/react-icons";
import {
  FolderDotIcon,
  PanelsTopLeftIcon,
  FileBarChart2,
  SettingsIcon,
  PieChartIcon,
  ShoppingBagIcon,
  DatabaseIcon,
  SparkleIcon,
  Code2Icon,
  AppWindowIcon,
} from "lucide-react";
import { SupabaseLogo } from "./logos";

export type ResourceTypeIconName =
  | "folder"
  | "file"
  | "setting"
  | "home"
  | "ai"
  | "dev"
  | "database"
  | "table"
  | "project"
  | "form"
  | "chart"
  | "commerce"
  | "user"
  | "supabase"
  | "form-x-supabase"
  | "v0_form"
  | "v0_site"
  | "v0_schema";

export function ResourceTypeIcon({
  type,
  className,
}: {
  type: ResourceTypeIconName;
  className?: string;
}) {
  const props = {
    className,
  };

  switch (type) {
    case "ai":
      return <SparkleIcon {...props} />;
    case "dev":
      return <Code2Icon {...props} />;
    case "home":
      return <HomeIcon {...props} />;
    case "project":
    case "folder":
      return <FolderDotIcon {...props} />;
    case "file":
      return <FileIcon {...props} />;
    case "v0_schema":
    case "database":
      return <DatabaseIcon {...props} />;
    case "table":
      return <PanelsTopLeftIcon {...props} />;
    case "v0_form":
    case "form":
      return <FileBarChart2 {...props} />;
    case "chart":
      return <PieChartIcon {...props} />;
    case "v0_site":
      return <AppWindowIcon {...props} />;
    case "form-x-supabase":
    case "supabase":
      return <SupabaseLogo {...props} />;
    case "setting":
      return <SettingsIcon {...props} />;
    case "commerce":
      return <ShoppingBagIcon {...props} />;
    case "user":
      return <AvatarIcon {...props} />;
    default:
      return null;
  }
}
