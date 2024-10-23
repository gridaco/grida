import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

export const RichTextContent = dynamic(() => import("./editor-content"), {
  loading: (props) => <Skeleton className={"min-h-[60px] w-full"} />,
});

export * from "./schema";
