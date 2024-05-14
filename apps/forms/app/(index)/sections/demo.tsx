"use client";

import { Card } from "@/components/ui/card";
import Playground from "@/scaffolds/playground";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const Prompt = dynamic(() => import("@/app/(site)/ai/prompt"), {
  ssr: false,
});

export default function Demo() {
  return (
    <section className="container mx-auto px-4 min-h-96">
      <motion.div
        className="hidden md:block z-10 -mt-40 mb-32"
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-video overflow-hidden">
          <Playground />
        </Card>
      </motion.div>
      <div className="mt-20">
        <div className="text-center mb-5 z-10">
          <h2 className="text-2xl font-bold drop-shadow-lg">
            Build Forms{" "}
            <span
              className="bg-clip-text
            text-transparent bg-gradient-to-r from-[#f47272] to-[#c91773] dark:from-[#f4ba72] dark:to-[#f0f472]
          "
            >
              with AI
            </span>
          </h2>
          <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
            Enter your prompt and try it out in the playground
          </p>
        </div>
        <Prompt />
      </div>
    </section>
  );
}
