import { GridaLogo } from "@/components/grida-logo";
import { SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-col justify-center h-screen p-24">
        <section>
          <div className="flex flex-col">
            <h1 className="text-6xl font-bold py-10">
              Forms for
              <br />
              developers
            </h1>
            <p className="text-lg opacity-80 max-w-sm">
              Grida Forms is a{" "}
              <code className="underline">headless & api-first</code> form
              builder for developers
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

async function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 p-24 flex justify-between items-center">
      <div className="flex">
        <span className="flex items-center gap-2">
          <Link href="https://grida.co" target="_blank">
            <GridaLogo />
          </Link>
          <SlashIcon width={20} height={20} />
          <Link href="/">
            <span className="text-2xl font-bold dark:text-white">Forms</span>
          </Link>
        </span>
      </div>
      <div className="flex gap-10 items-center">
        <Link href="/sign-in">
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
