import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export default function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 py-4 px-4 md:py-8 md:px-24 flex justify-between items-center z-50">
      <div className="flex">
        <span className="flex items-center gap-2">
          <Link href="https://grida.co" target="_blank">
            <GridaLogo className="w-5 h-5" />
          </Link>
          <SlashIcon width={20} height={20} />
          <Link href="/">
            <span className="text-xl font-bold">Grida Forms</span>
          </Link>
        </span>
      </div>
      <div className="flex gap-2 items-center">
        <Link href="https://github.com/gridaco/grida/tree/main/apps/forms">
          <Button variant="ghost" size="icon">
            <GitHubLogoIcon className="fill-black" width={24} height={24} />
          </Button>
        </Link>
        <Link href="/ai" className="hidden md:block">
          <Button variant="link">AI</Button>
        </Link>
        <Link href="/playground" className="hidden md:block">
          <Button variant="link">Playground</Button>
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
