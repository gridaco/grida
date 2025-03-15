"use client";

import Header from "@/www/header";
import Footer from "@/www/footer";
import Image from "next/image";
import React, { useState } from "react";
import { ArrowDown, Github, Redo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "lucide-react";

export default function CiPage() {
  return (
    <main className="">
      <Header />
      <Hero />
      <Demo1 />
      <Demo2 />
      <Demo3 />
      <div className="min-h-screen" />
      <Footer />
    </main>
  );
}

function Hero() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center p-4 md:p-8">
      <span className="px-3 py-1 text-xs font-mono text-white bg-black">
        _Grida CLI // Beta_
      </span>
      <h1 className="text-6xl font-bold mt-12">CI your design.</h1>
      <p className="text-gray-500 max-w-lg mt-12">
        Grida CLI generates code from Design input and saves it directly into
        your workspace. Use your design like a package.
      </p>

      <div className="flex gap-4 mt-12">
        <Button
          variant="outline"
          className="border border-gray-400 bg-white text-black font-mono dark:border-none"
          onClick={() => {
            navigator.clipboard.writeText("npx grida init");
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          }}
        >
          {copied ? "Copied to clipboard" : "npx grida init"}
        </Button>
        <a href="https://grida.co/docs/cli">
          <Button
            variant="default"
            className="bg-black text-white font-mono dark:hover:bg-neutral-700"
          >
            Start Coding
          </Button>
        </a>
      </div>
    </section>
  );
}

function Demo1() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center bg-gradient-to-b from-black to-slate-800 text-white p-8">
      <h2 className="text-4xl font-bold max-w-2xl">
        One command to add designs as a module to your existing projects.
      </h2>
      <div className="flex flex-col gap-2">
        <div className="relative mt-12">
          <Image
            src="/images/top-design.png"
            alt="Figma to Code Demo"
            width={320}
            height={180}
            className="w-40"
          />
        </div>

        <div className="relative">
          <Image
            src="/images/bottom-code.png"
            alt="Figma to Code Demo"
            width={320}
            height={180}
            className="w-40"
          />
        </div>
      </div>
      <h3 className="text-xl font-semibold mt-12">Be the Maestro.</h3>
      <p className=" text-muted-foreground max-w-lg mt-4">
        You can import your design like a well-coded library, with full
        documentations. <br />
        We play the details // you play the orchestra.
      </p>

      <div className="absolute bottom-8">
        <span className="text-white text-2xl">↓</span>
      </div>
    </section>
  );
}

function Demo2() {
  return (
    <section className="flex flex-col gap-12 bg-gray-50 py-40 ">
      <div className="flex items-center justify-center">
        <Image
          src="/images/abstract-placeholder.jpg"
          alt="Demo"
          width={600}
          height={300}
        />
      </div>
      <div className="flex items-center gap-2 justify-center">
        <p className="text-black text-center font-medium text-lg">replay</p>
        <Redo2Icon className="text-black" />
      </div>
    </section>
  );
}

function Demo3() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="relative min-h-screen items-center flex flex-col justify-center px-8 py-20 bg-black text-white">
      <div className="max-w-3xl">
        <h2 className="text-4xl font-bold">Fits into your configuration.</h2>
        <p className=" opacity-50 mt-6">
          Configure grida with{" "}
          <span className="font-mono">grida.config.js</span>. You can define
          plugins, output code styles and customize the behavior deep down to
          AST level.
        </p>
        <ul className="mt-12 space-y-3 text-lg">
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> secure, runs locally
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> zero dependency by default
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> works with svelte
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> works with solid-js
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> works with vanilla html/css
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> works with react & react-native
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon size={16} /> works with flutter
          </li>
        </ul>

        <a
          href="https://grida.co/docs/cli"
          className="mt-12 inline-block text-lg font-semibold underline"
        >
          Read the docs
        </a>
      </div>

      <div className="absolute lg:w-[1000px] sm:w-[600px] w-[400px] bottom-[-400px] left-1/2 transform -translate-x-1/2">
        <Card className="px-20 md:px-40 py-24 flex flex-col gap-20 shadow-lg bg-white text-black border-gray-200">
          <h3 className="text-3xl md:text-5xl font-semibold text-center">
            CI your design.
          </h3>
          <div className="flex gap-4 mt-4 items-center justify-center">
            <a href="https://grida.co/docs/cli">
              <Button
                variant="default"
                className="bg-black text-white font-mono dark:hover:bg-neutral-700"
              >
                Start Coding
              </Button>
            </a>
            <Button
              variant="outline"
              className="border border-gray-400 bg-white text-black font-mono dark:border-none"
              onClick={() => {
                navigator.clipboard.writeText("npx grida init");
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
              }}
            >
              {copied ? "Copied to clipboard" : "npx grida init"}
            </Button>
          </div>
        </Card>
        <h4 className="text-center text-muted-foreground mt-24 font-mono">
          This page was made with grida CLI under 7 minutes with NextJS &
          @emotion/styled
        </h4>
      </div>
    </section>
  );
}
