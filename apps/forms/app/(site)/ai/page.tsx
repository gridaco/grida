import { Metadata } from "next";
import Prompt from "./prompt";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Header } from "@/app/(site)/header";
import { FormPageBackground } from "@/scaffolds/e/form/background";
export const metadata: Metadata = {
  title: "AI Forms Builder | Grida Forms",
  description: "Grida Forms AI Forms Builder",
};

export default function AIHome() {
  return (
    <main className="flex flex-col w-full min-h-screen items-center justify-center">
      <FormPageBackground
        type="background"
        element="iframe"
        src="https://forms.grida.co/theme/embed/backgrounds/grid"
      />
      <div className="absolute inset-0 bg-neutral-100/50 dark:bg-neutral-500/10 pointer-events-none select-none" />
      <Header />
      <div className="text-center mb-5 z-10">
        <h2 className="text-5xl font-bold drop-shadow-lg">
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
          Describe your form and see the magic happen
        </p>
      </div>
      <div className="p-4 z-10">
        <Prompt autoFocus />
      </div>
      <div className="mt-10 z-10">
        <Link href="/playground">
          <Button variant="link">Jump to playground</Button>
        </Link>
      </div>
    </main>
  );
}
