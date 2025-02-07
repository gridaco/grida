import { Button } from "@/components/ui/button";
import React, { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { FormPageBackground } from "@/scaffolds/e/form/background";
import { ArrowBigRight, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-screen overflow-hidden items-ieft justify-center">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="text-black dark:text-white"
      >
        <div className="flex flex-col items-left text-center">
          <h1 className="text-5xl lg:text-6xl font-bold py-10 text-left">
            The editor to craft, customize,
            <br /> and create seamlessly.
          </h1>
          <p className="text-lg opacity-80 text-left">
            Grida combines custom branding, intuitive design, and
            developer-friendly tools to streamline your workflow.
            <br /> Design smarter, manage seamlessly, and create without limits.
          </p>
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            viewport={{ once: true }}
            className="flex gap-4 mt-16"
          >
            <Button className="px-8 py-6 border-2 border-black flex gap-2 group text-lg font-normal">
              Start your project
              <ArrowRight className="h-5 w-5 hidden group-hover:inline-block transition-all duration-500"></ArrowRight>
            </Button>

            <Button
              variant="outline"
              className="px-8 py-6 border-2 border-black bg-none text-lg font-normal"
            >
              Try to demo
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
