import { FormEditorState } from "@/scaffolds/editor/state";
import { AvatarIcon } from "@radix-ui/react-icons";
import { Table2Icon } from "lucide-react";
import { SupabaseLogo } from "./logos";

export function TableTypeIcon({
  type,
  className,
}: {
  type: FormEditorState["datagrid_table"];
  className?: string;
}) {
  const props = {
    className,
  };
  switch (type) {
    case "customer":
      return <AvatarIcon {...props} />;
    case "response":
    case "session":
      return <Table2Icon {...props} />;
    case "x-supabase-auth.users":
    case "x-supabase-main-table":
      return <SupabaseLogo {...props} />;
    default:
      return <Table2Icon {...props} />;
  }
}
