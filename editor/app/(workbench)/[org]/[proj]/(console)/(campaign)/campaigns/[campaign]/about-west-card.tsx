"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ShineBorder } from "@/www/ui/shine-border";
import { CrossCircledIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { toast } from "sonner";

export function AboutGridaWestCard() {
  const [donotshowagain, set] = useLocalStorage(
    "do-not-show-again-grida-west-card",
    false
  );

  if (donotshowagain) return null;

  return (
    <Card className="group/card relative overflow-hidden bg-transparent dark:bg-white/50 p-0">
      <ShineBorder />
      <div className="z-20 absolute inset-0 flex flex-col">
        <div className="opacity-0 pointer-events-none absolute z-20 top-2 right-2 group-hover/card:opacity-100 group-hover/card:pointer-events-auto transition-all">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full p-0 size-4"
            onClick={() => {
              toast("okay, we won't show this again");
              set(true);
            }}
          >
            <CrossCircledIcon />
          </Button>
        </div>
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-background/25 opacity-20 group-hover/card:opacity-100 transition-all" />
        <Image
          src="/west/logo-with-type.png"
          width={400}
          height={200}
          alt="grida west"
          className="absolute h-7 bottom-4 left-4 object-contain object-left invert group-hover/card:bottom-20 group-hover/card:invert-0 dark:!invert transition-all pointer-events-none select-none"
        />
        <p className="absolute bottom-0 left-4 right-4 opacity-0 text-xs text-muted-foreground group-hover/card:bottom-4 group-hover/card:opacity-100 transition-all">
          Grida WEST is a gamified marketing platform for modern-day cowboys and
          cowgirls.
        </p>
      </div>
      <div className="pointer-events-none select-none">
        <Image
          src="/west/poster.png"
          width={400}
          height={800}
          alt="grida west"
          className="object-cover w-full object-center"
          style={{
            aspectRatio: "4/5",
          }}
        />
      </div>
    </Card>
  );
}
