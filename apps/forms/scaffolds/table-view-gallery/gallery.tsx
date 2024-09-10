import { cn } from "@/utils";
import { GalleryModelCard } from "./modelcard";

export function Gallery({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "p-4 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
    >
      <GalleryModelCard title={"Title"} />
      <GalleryModelCard title={"Title"} />
      <GalleryModelCard title={"Title"} />
      <GalleryModelCard title={"Title"} />
      <GalleryModelCard title={"Title"} />
      <GalleryModelCard title={"Title"} />
    </div>
  );
}
