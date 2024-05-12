import { Metadata } from "next";
import { Prompt } from "./prompt";

export const metadata: Metadata = {
  title: "AI Forms Builder | Grida Forms",
  description: "Grida Forms AI Forms Builder",
};

export default function AIHome() {
  return (
    <main className="flex flex-col w-full min-h-screen items-center justify-center">
      <div className="text-center mb-5">
        <h2 className="text-5xl font-bold">Build Forms with AI</h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          Enter your AI prompt and let the magic happen.
        </p>
      </div>
      <Prompt />
    </main>
  );
}
