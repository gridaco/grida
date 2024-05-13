"use server";
import { GridaLogo } from "@/components/grida-logo";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export async function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 py-4 px-4 md:py-8 md:px-24 flex justify-between items-center z-50">
      <div className="flex">
        <span className="flex items-center gap-2">
          <Link href="https://grida.co" target="_blank">
            <GridaLogo />
          </Link>
          <SlashIcon width={20} height={20} />
          <Link href="/">
            <span className="text-2xl font-bold dark:text-white">
              Grida Forms
            </span>
          </Link>
        </span>
      </div>
      <div className="flex gap-10 items-center">
        <Link href="https://github.com/gridaco/grida/tree/main/apps/forms">
          <button className="flex justify-center items-center">
            <GitHubLogoIcon className="fill-black" width={24} height={24} />
          </button>
        </Link>
        <Link href="/ai" className="hidden md:block">
          <button className="hover:underline">AI</button>
        </Link>
        <Link href="/playground" className="hidden md:block">
          <button className="hover:underline">Playground</button>
        </Link>
        <Link href="/sign-in" className="hidden md:block">
          <button>Sign in</button>
        </Link>
        <Link href="/sign-in">
          <button className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black">
            Get Started
          </button>
        </Link>
      </div>
    </header>
  );
}
