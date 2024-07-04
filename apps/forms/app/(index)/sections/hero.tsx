import { FormPageBackground } from "@/scaffolds/e/form/background";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col h-screen overflow-hidden items-center justify-center">
      <div className="text-black dark:text-white">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-6xl font-bold py-10 text-center">
            Forms for developers
          </h1>
          <p className="text-lg opacity-80 max-w-md">
            Grida Forms is a{" "}
            <span>
              <code className="underline">headless & api-first</code> form
            </span>
            builder for developers
          </p>
          <Link href="/dashboard">
            <button className="mt-16 px-3 py-2 bg-neutral-800 text-white rounded border border-neutral-800 hover:invert transition-all">
              Start your project
            </button>
          </Link>
        </div>
      </div>
      <FormPageBackground
        type="background"
        element="iframe"
        src="https://forms.grida.co/theme/embed/backgrounds/dots"
      />
    </section>
  );
}
