"use client";
import React, { useState } from "react";
import { motion } from "motion/react";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import { Section } from "@/www/ui/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PdfFlipBookPage() {
  const [locked, setLocked] = useState(true);
  return (
    <main className="overflow-x-hidden">
      <Header />
      <Section container className="pt-40 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-6">
            PDF Flip Book
          </h1>
          <p className="max-w-xl mx-auto text-sm md:text-base text-muted-foreground">
            Turn PDFs into interactive flipbooks stored for free on Grida.
          </p>
        </motion.div>
      </Section>
      <Section container className="-mt-28 md:-mt-48 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative p-0">
            {locked && (
              <div
                className="absolute inset-0 from-background/80 to-background/20 bg-gradient-to-t z-20 flex items-center justify-center cursor-pointer"
                onClick={() => setLocked(false)}
              >
                <Button>Try it out</Button>
              </div>
            )}
            <div
              data-locked={locked}
              className="w-full h-full pointer-events-none data-[locked='false']:pointer-events-auto"
            >
              <iframe
                src="https://viewer.grida.co/v1/pdf/test"
                className="w-full h-full"
              />
            </div>
          </Card>
        </motion.div>
      </Section>
      <FooterWithCTA />
    </main>
  );
}
