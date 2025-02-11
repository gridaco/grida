import { Button } from "@/components/ui/button";
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-screen min-h-96 overflow-hidden items-ieft justify-center">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="text-black dark:text-white"
      >
        <div className="flex flex-col items-left text-center">
          <h1 className="text-5xl lg:text-6xl font-bold py-10 text-left">
            The Free, Open Canvas
          </h1>
          <p className="max-w-md text-lg text-muted-foreground text-left">
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
              Start your project
              <ArrowRight className="h-5 w-5" />
            </Button>

            <Button variant="outline">Try the demo</Button>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
