import { Button } from "@/components/ui/button";
import { FormPageBackground } from "@/scaffolds/e/form/background";
import { ArrowBigRight, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function Hero() {
  return (
    <section className="relative flex flex-col h-screen overflow-hidden items-center justify-center">
      <div className="text-black dark:text-white">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-6xl font-bold py-10 text-center">
            The editor to craft, customize,
            <br /> and create seamlessly.
          </h1>
          <p className="text-lg opacity-80">
            Grida combines custom branding, intuitive design, and
            developer-friendly tools to streamline your workflow.
            <br /> With tailored solutions, diverse templates, and automated
            systems, it’s built for efficiency and scalability.
            <br /> Design smarter, manage seamlessly, and create without limits.
          </p>
          <div className="flex gap-4">
            <Link href="/dashboard">
              <Button className="mt-16 flex gap-2 group">
                <p>Start your project</p>
                <ArrowRight className="h-5 w-5 hidden group-hover:inline-block transition-all duration-500"></ArrowRight>
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" className="mt-16">
                <p>Try to demo</p>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
