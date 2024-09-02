import { Button } from "@/components/ui/button";
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
            <Button className="mt-16">Start your project</Button>
          </Link>
        </div>
      </div>
      <FormPageBackground
        type="background"
        element="iframe"
        src="https://bg.grida.co/embed/dots"
      />
    </section>
  );
}
