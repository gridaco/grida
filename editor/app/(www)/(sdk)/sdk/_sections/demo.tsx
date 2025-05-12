"use client";
import React, { useState } from "react";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShineBorder } from "@/www/ui/shine-border";
import { PlayFilledIcon } from "@/components/icons";

export default function SectionMainDemo() {
  const [isLocked, setIsLocked] = useState(true);

  const unlockDemo = () => {
    setIsLocked(false);
  };

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 50,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        delay: 0.5,
        duration: 1.5,
        ease: "easeOut",
      }}
    >
      <Card
        data-locked={isLocked}
        className="group/demo-card mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative p-0"
      >
        <ShineBorder
          shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]}
          className="opacity-100 group-data-[locked='false']/demo-card:opacity-0 transition-opacity duration-1000"
        />
        {/* Overlay for lock */}
        {isLocked && (
          <div
            className="absolute inset-0 from-background/80 to-background/20 bg-gradient-to-t z-20 flex items-center justify-center cursor-pointer"
            onClick={unlockDemo}
          >
            <Button>
              <PlayFilledIcon className="size-4" />
              Try it out
            </Button>
          </div>
        )}
        <div
          data-locked={isLocked}
          className="w-full h-full pointer-events-none group-data-[locked='false']/demo-card:pointer-events-auto"
        >
          <iframe src="/www-embed/demo-canvas" className="w-full h-full" />
        </div>
      </Card>
    </motion.div>
  );
}
