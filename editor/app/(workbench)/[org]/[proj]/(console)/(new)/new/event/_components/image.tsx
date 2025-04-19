import { ImageIcon } from "lucide-react";
import Image from "next/image";

export function MainImage({
  src = "/images/abstract-placeholder.jpg",
}: {
  src?: string;
}) {
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden max-w-80">
      <Image
        src={src}
        width={800}
        height={800}
        alt="main image"
        className="w-full h-full object-cover aspect-square"
      />
      <div className="absolute bottom-4 right-4">
        <button className="rounded-full bg-transparent border-2 border-background p-2 transition-colors">
          <ImageIcon className="size-5 text-background" />
        </button>
      </div>
    </div>
  );
}
