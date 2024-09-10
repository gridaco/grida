import { cn } from "@/utils";
import { GalleryModelCard } from "./modelcard";

export function Gallery({ className }: { className?: string }) {
  return (
    <div className={cn("p-4 grid", className)}>
      <GalleryModelCard />
      <GalleryModelCard />
      <GalleryModelCard />
      <GalleryModelCard />
      <GalleryModelCard />
    </div>
  );
}
