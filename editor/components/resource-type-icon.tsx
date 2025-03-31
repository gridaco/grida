import {
  AvatarIcon,
  GridIcon,
  ListBulletIcon,
  HomeIcon,
} from "@radix-ui/react-icons";
import {
  FolderDotIcon,
  FolderIcon,
  FileIcon,
  PanelsTopLeftIcon,
  FileBarChart2,
  SettingsIcon,
  PieChartIcon,
  ShoppingBagIcon,
  DatabaseIcon,
  SparkleIcon,
  Code2Icon,
  AppWindowIcon,
  LanguagesIcon,
  LineChartIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  PenToolIcon,
  FoldersIcon,
  MegaphoneIcon,
  PlugIcon,
  TagIcon,
  LockKeyholeIcon,
} from "lucide-react";
import { SupabaseLogo } from "./logos";

export type ResourceTypeIconName =
  | "auth"
  | "folder"
  | "file"
  | "setting"
  | "tag"
  | "home"
  | "ai"
  | "dev"
  | "database"
  | "table"
  | "project"
  | "form"
  | "view-gallery"
  | "gallery"
  | "view-list"
  | "list"
  | "chart"
  | "chart-bar"
  | "chart-bar-vertical"
  | "chart-line"
  | "chart-pie"
  | "commerce"
  | "connect"
  | "campaign"
  | "customer"
  | "user"
  | "i18n"
  | "supabase"
  | "form-x-supabase"
  | "v0_bucket"
  | "v0_form"
  | "v0_site"
  | "v0_canvas"
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
    case "auth":
      return <LockKeyholeIcon {...props} />;
    case "tag":
      return <TagIcon {...props} />;
    case "ai":
      return <SparkleIcon {...props} />;
    case "dev":
      return <Code2Icon {...props} />;
    case "home":
      return <HomeIcon {...props} />;
    case "project":
      return <FolderDotIcon {...props} />;
    case "folder":
      return <FolderIcon {...props} />;
    case "file":
      return <FileIcon {...props} />;
    case "v0_bucket":
      return <FoldersIcon {...props} />;
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
    case "chart-bar":
      return <BarChart3Icon {...props} />;
    case "chart-bar-vertical":
      return <BarChartHorizontalIcon {...props} />;
    case "chart-line":
      return <LineChartIcon {...props} />;
    case "chart-pie":
      return <PieChartIcon {...props} />;
    case "campaign":
      return <MegaphoneIcon {...props} />;
    case "connect":
      return <PlugIcon {...props} />;
    case "v0_site":
      return <AppWindowIcon {...props} />;
    case "v0_canvas":
      return <PenToolIcon {...props} />;
    case "form-x-supabase":
    case "supabase":
      return <SupabaseLogo {...props} />;
    case "setting":
      return <SettingsIcon {...props} />;
    case "commerce":
      return <ShoppingBagIcon {...props} />;
    case "user":
    case "customer":
      return <AvatarIcon {...props} />;
    case "i18n":
      return <LanguagesIcon {...props} />;
    case "view-gallery":
    case "gallery":
      return <GridIcon {...props} />;
    case "view-list":
    case "list":
      return <ListBulletIcon {...props} />;
    default:
      return null;
  }
}
