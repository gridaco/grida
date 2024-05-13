import { Metadata } from "next";
import { Prompt } from "./prompt";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Header } from "@/app/(site)/header";
export const metadata: Metadata = {
  title: "AI Forms Builder | Grida Forms",
  description: "Grida Forms AI Forms Builder",
};

export default function AIHome() {
  return (
    <main className="flex flex-col w-full min-h-screen items-center justify-center">
      <Header />
      <div className="text-center mb-5">
        <h2 className="text-5xl font-bold">Build Forms with AI</h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          Describe your form and see the magic happen
        </p>
      </div>
      <Prompt />
      <div className="mt-10">
        <Link href="/playground">
          <Button variant="link">Jump to playground</Button>
        </Link>
      </div>
    </main>
  );
}
