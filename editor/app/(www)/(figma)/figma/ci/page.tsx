"use client";

import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Image from "next/image";
import React, { useState, useEffect, useRef } from "react";
import { ArrowDown, Github, Redo2Icon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Figma CI | Automate Your Design Workflow",
  description: "Continuous integration for Figma projects powered by Grida.",
};

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
          onClick={() => {
            navigator.clipboard.writeText("npx grida init");
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          }}
        >
          {copied ? "Copied to clipboard" : "npx grida init"}
        </Button>
        <a href="https://grida.co/docs/cli">
          <Button variant="default">Start Coding</Button>
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
      <div className="flex flex-col gap-6 items-center">
        <div className="relative mt-12">
          <Image
            src="/www/.figma/ci/top-design.png"
            alt="Figma to Code Demo"
            width={320}
            height={180}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl shadow-lg px-4 py-3 font-mono max-w-full">
          <span className=" text-muted-foreground">→</span>
          <span className="font-bold text-xs text-black whitespace-nowrap">
            grida add
          </span>
          <div className="overflow-x-auto max-w-[300px] no-scrollbar">
            <span className="text-gray-600 text-xs  whitespace-nowrap block ">
              https://www.figma.com/file/x7RRK6RwWtZuNakmbMLTVH/?node-id=906%3A779
            </span>
          </div>
        </div>
        <div className="relative">
          <Image
            src="/www/.figma/ci/bottom-code.png"
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
      <TerminalAnimation />
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
        <Card className="px-20 md:px-40 py-24 flex flex-col gap-20 shadow-lg bg-white dark:bg-neutral-800 text-black border-gray-200 dark:border-neutral-700">
          <h3 className="dark:text-white text-3xl md:text-5xl font-semibold text-center">
            CI your design.
          </h3>
          <div className="flex gap-4 mt-4 items-center justify-center">
            <a href="https://grida.co/docs/cli">
              <Button variant="default">Start Coding</Button>
            </a>
            <Button
              variant="outline"
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

const terminalText = `➜ ~/ grida add https://www.figma.com/file/x7RRK6RwWtZuNakmbMLTVH/?node-id=906%3A779
➜ ~/ Fetching desing...
➜ ~/ Generating code
➜ ~/ Fetching assets..
➜ ~/ Module added to ./src/grida/home.tsx
➜ ~/ To use this module, import..

     \`\`\`
     import React from "react";
     import { Home } from "./grida/home";
     \`\`\`

➜ ~/`;

function TerminalAnimation() {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [key, setKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Function to handle the typing animation
  useEffect(() => {
    if (!isAnimating) return;

    let currentIndex = 0;
    const textLength = terminalText.length;

    const typingInterval = setInterval(() => {
      if (currentIndex < textLength) {
        setDisplayedText(terminalText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setIsComplete(true);
      }
    }, 30); // Adjust typing speed here

    return () => clearInterval(typingInterval);
  }, [isAnimating, key]);

  // Reset animation function
  const handleReplay = () => {
    setDisplayedText("");
    setIsComplete(false);
    setKey((prev) => prev + 1);
    setIsAnimating(true);
  };

  // Function to apply syntax highlighting
  const formatWithSyntaxHighlighting = (text: string) => {
    // Split the text into lines for processing
    const lines = text.split("\n");

    return lines
      .map((line, lineIndex) => {
        // Handle command lines with arrows
        if (line.startsWith("➜ ~/")) {
          // Special case for the line with node-id
          if (line.includes("node-id=")) {
            const parts = line.split("node-id=");
            return (
              <span key={lineIndex}>
                <span className="text-gray-700">➜ ~/ </span>
                {parts[0].substring(5)}
                <span className="text-teal-500">node-id={parts[1]}</span>
              </span>
            );
          }
          return (
            <span key={lineIndex}>
              <span className="text-gray-700">➜ ~/ </span>
              <span>{line.substring(5)}</span>
            </span>
          );
        }

        // Handle import statements
        if (line.includes("import")) {
          // Match the import React from "react" pattern
          if (line.includes("import React from")) {
            return (
              <span key={lineIndex}>
                <span>import </span>
                <span className="text-teal-500">React</span>
                <span> </span>
                <span className="text-cyan-500">from</span>
                <span> </span>
                <span className="text-teal-500">&quot;react&quot;</span>
                <span>;</span>
              </span>
            );
          }

          // Match the import { Home } from "./grida/home" pattern
          if (line.includes("import { Home }")) {
            return (
              <span key={lineIndex}>
                <span>import &#123; </span>
                <span className="text-teal-500">Home</span>
                <span> &#125; </span>
                <span className="text-cyan-500">from</span>
                <span> </span>
                <span className="text-teal-500">&quot;./grida/home&quot;</span>
                <span>;</span>
              </span>
            );
          }
        }

        // Return other lines unchanged
        return <span key={lineIndex}>{line}</span>;
      })
      .reduce((acc: React.ReactNode[], element, index) => {
        return [...acc, element, <br key={`br-${index}`} />];
      }, [])
      .slice(0, -1); // Remove the last <br/>
  };

  // Create a non-animated version of the full text with syntax highlighting
  const fullFormattedText = formatWithSyntaxHighlighting(terminalText);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsAnimating(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={observerRef}
      className="flex flex-col items-center justify-center min-h-[500px] p-4 md:p-8"
    >
      <div
        ref={containerRef}
        className="w-full max-w-3xl bg-white rounded-lg overflow-hidden shadow-xl border border-gray-200"
      >
        {/* Terminal header */}
        <div className="flex items-center px-4 py-2 bg-gray-100 border-b-gray-200">
          <div className="flex space-x-2">
            <div className="size-4 rounded-full border border-neutral-200 bg-red-400"></div>
            <div className="size-4 rounded-full border border-neutral-200 bg-yellow-400"></div>
            <div className="size-4 rounded-full border border-neutral-200 bg-green-400"></div>
          </div>
          <div className="mx-auto text-sm text-gray-500">
            ~/projects/my-react-app -- zsh
          </div>
        </div>

        {/* Terminal content */}
        <div
          ref={contentRef}
          className="p-4 h-[300px] overflow-auto font-mono text-sm bg-white relative"
        >
          {/* Invisible full formatted text to maintain width and structure */}
          <div className="whitespace-pre-wrap invisible absolute">
            {fullFormattedText}
          </div>

          {/* Visible animated text with syntax highlighting */}
          <div className="whitespace-pre-wrap text-gray-500">
            {isAnimating && displayedText
              ? formatWithSyntaxHighlighting(displayedText)
              : null}
            {!isComplete && isAnimating && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ repeat: Number.POSITIVE_INFINITY, duration: 0.2 }}
                className="inline-block w-2 h-4 ml-1 bg-gray-800"
              />
            )}
          </div>
        </div>
      </div>

      <Button
        onClick={handleReplay}
        variant="outline"
        className="mt-6 flex items-center gap-2 px-4 py-2 transition-all duration-300 border border-gray-200 rounded-full bg-white text-black"
      >
        <RefreshCw className="size-4" />
        <span>replay</span>
      </Button>
    </div>
  );
}
