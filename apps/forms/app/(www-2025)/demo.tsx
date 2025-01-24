"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import Playground from "@/scaffolds/playground";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "@radix-ui/react-icons";

const Prompt = dynamic(() => import("@/app/(site)/ai/prompt"), {
  ssr: false,
});

export default function Demo() {
  return (
    <section className="container mx-auto px-4 min-h-96">
      <motion.div
        className="hidden md:block z-10 -mt-40 mb-32"
        initial={{ opacity: 1, y: 100, scale: 1 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          delay: 0.2,
          duration: 0.3,
          type: "spring",
          damping: 20,
        }}
      >
        <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-video overflow-hidden">
          <Playground />
        </Card>
      </motion.div>
      <div className="mt-20">
        <div className="flex flex-col w-full items-center justify-center">
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
          <div className="p-4 z-10">
            <Prompt />
          </div>
          <div className="mt-10 z-10">
            <Link href="/playground">
              <Button variant="link">
                Jump to playground
                <ArrowRightIcon className="ms-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
