import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";

import { NavigationMenuDemo } from "./2025/tmp";

export default function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 py-4 px-4 lg:py-8 lg:px-24 flex justify-between items-center z-50">
      <div className="flex">
        <span className="flex items-center gap-2">
          <Link href="https://grida.co" target="_blank">
            <GridaLogo className="w-6 h-6" />
          </Link>

          <Link href="/">
            <span className="text-xl font-bold">Grida</span>
          </Link>
        </span>
      </div>
      <div className="flex gap-12 items-center">
        <NavigationMenuDemo />
        <div className="flex gap-2">
          <Link href="/sign-in" className="hidden md:block">
            <Button variant="ghost" className="px-8 py-6 text-lg font-normal">
              Sign in
            </Button>
          </Link>
          <Link href="/dashboard/new?plan=free">
            <Button className="px-8 py-6 flex gap-2 group text-lg font-normal">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
