import React from "react";
import { GiftIcon } from "lucide-react";
import { ScratchToReveal } from "@/www/ui/scratch-to-reveal";
import { Badge } from "@/components/ui/badge";
import { GridaLogo } from "@/components/grida-logo";
import ScratchAnimation from "@/www/ui/scratch-animation";

export default function HelloDemo() {
  const [scratchComplete, setScratchComplete] = React.useState(false);

  return (
    <div className="w-[400px] h-[600px] dark:bg-white/10 bg-white/40 overflow-hidden rounded-3xl border shadow-md p-4 flex flex-col items-center justify-center">
      <div className="w-[40px] h-[40px] items-center justify-center">
        <GridaLogo />
      </div>
      <Badge variant="outline" className="mt-4 mb-6">
        Grida has sent you an invitation.
      </Badge>
      <ScratchToReveal
        width={350}
        height={350}
        minScratchPercentage={60}
        onStart={() => setScratchComplete(true)}
        onComplete={() => {}}
        className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-background border shadow-lg"
        gradientColors={["#000", "#333", "#666"]}
      >
        <div className="w-full h-full p-6 flex flex-col items-center justify-center text-center">
          <GiftIcon className="size-10 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold">100,000 Points </h2>
          <hr className="my-2" />
          <p className="text-sm text-muted-foreground">
            Participate in the event <br /> and claim 100,000 points!
          </p>
          {!scratchComplete && (
            <div className="absolute inset-0 pointer-events-none">
              <ScratchAnimation width={350} height={350} enabled={true} />
            </div>
          )}
        </div>
      </ScratchToReveal>
      <p className="underline text-sm text-muted-foreground mt-4">
        👆 Swipe your finger to scratch the card
      </p>
    </div>
  );
}
