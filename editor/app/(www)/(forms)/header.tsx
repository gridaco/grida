import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export default function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 py-4 px-4 lg:py-8 lg:px-24 flex justify-between items-center z-50">
      <div className="flex">
        <span className="flex items-center gap-2">
          <Link href="/">
            <GridaLogo className="w-5 h-5" />
          </Link>
          <Link href="/forms">
            <span className="text-lg font-bold">Grida Forms</span>
          </Link>
        </span>
      </div>
      <div className="flex gap-2 items-center">
        <Link href="https://github.com/gridaco/grida">
          <Button variant="ghost" size="icon">
            <GitHubLogoIcon className="fill-black" width={24} height={24} />
          </Button>
        </Link>
        <Link href="/forms/ai" className="hidden md:block">
          <Button variant="link">AI</Button>
        </Link>
        <Link href="/playground" className="hidden md:block">
          <Button variant="link">Playground</Button>
        </Link>
        <Link href="/forms/templates" className="hidden md:block">
          <Button variant="link">Templates</Button>
        </Link>
        <div className="flex-1 h-8 border-r mx-4" />
        <Link href="/sign-in" className="hidden md:block">
          <Button variant="ghost">Sign in</Button>
        </Link>
        <Link href="/dashboard/new?plan=free">
          <Button>Get Started</Button>
        </Link>
      </div>
    </header>
  );
}
