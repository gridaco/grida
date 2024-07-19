import data from "@/backgrounds";
import { GridaLogo } from "@/components/grida-logo";
import { Preview } from "@/components/preview";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh">
      <header className="px-4 lg:px-6 h-14 flex items-center">
        <Link
          href="#"
          className="flex items-center justify-center"
          prefetch={false}
        >
          <GridaLogo className="size-6" />
          <span className="sr-only">Backgrounds by Grida</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link
            href="https://github.com/gridaco/grida"
            className="text-sm font-medium hover:underline underline-offset-4"
            prefetch={false}
          >
            Githib
          </Link>
          <Link
            href="https://github.com/gridaco/grida/tree/main/apps/backgrounds"
            className="text-sm font-medium hover:underline underline-offset-4"
            prefetch={false}
          >
            Credits
          </Link>
          <Link
            href="https://github.com/gridaco/grida/issues/new"
            className="text-sm font-medium hover:underline underline-offset-4"
            prefetch={false}
          >
            Request
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container mx-auto space-y-12 px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center py-40">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Explore Our Dynamic Backgrounds
                </h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Browse through our curated collection of visually stunning
                  backgrounds, perfect for enhancing your website or
                  application.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {data.map((bg) => (
                <Card
                  key={bg.name}
                  title={bg.title}
                  description={bg.description}
                  preview={bg.preview}
                  href={bg.url}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Grida. All rights reserved.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link
            href="https://grida.co/docs/support/terms-and-conditions"
            className="text-xs hover:underline underline-offset-4"
            prefetch={false}
          >
            Terms of Service
          </Link>
          <Link
            href="https://grida.co/docs/support/privacy-policy"
            className="text-xs hover:underline underline-offset-4"
            prefetch={false}
          >
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}

function Card({
  title,
  description,
  preview,
  href,
}: {
  title: string;
  description: string;
  preview: [string] | [string, string];
  href: string;
}) {
  return (
    <div className="relative overflow-hidden transition-transform duration-300 ease-in-out rounded-lg shadow-lg group hover:shadow-xl hover:-translate-y-2">
      <Link href={href} prefetch={false}>
        <Preview preview={preview} />
        <div className="p-4 bg-background">
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </Link>
    </div>
  );
}
