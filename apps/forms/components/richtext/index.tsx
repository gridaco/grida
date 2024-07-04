import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

export const ThemedRichTextEditorContent = dynamic(
  () => import("./editor-content"),
  {
    loading: (props) => <Skeleton className={"min-h-[60px] w-full"} />,
  }
);
