import { Button } from "@/components/ui/button";
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-screen min-h-96 overflow-hidden items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
        className="text-black dark:text-white"
      >
        <div className="flex flex-col items-center text-center">
          <h1 className="text-5xl lg:text-6xl font-bold pb-8 text-center">
            The Free, Open Canvas
          </h1>
          <p className="max-w-md text-base text-muted-foreground text-center">
            Grida is an Open source Canvas where you can design & build web
            applications with templates
          </p>
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            viewport={{ once: true }}
            className="flex gap-4 mt-16"
          >
            <Button className="flex gap-2 group">
              <span>Start your project</span>
              <ArrowRight className="h-5 w-5 hidden group-hover:inline-block transition-all duration-500"></ArrowRight>
            </Button>

            <Button variant="outline" className="bg-none">
              Try the demo
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
