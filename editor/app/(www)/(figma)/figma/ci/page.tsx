import type { Metadata } from "next";
import Header from "@/www/header";
import Footer from "@/www/footer";

export const metadata: Metadata = {
  title: "Figma CI has been retired — Grida",
  description:
    "The legacy Grida Figma CI commands have been retired. Find current CLI capabilities and preview instructions in the Grida CLI docs.",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://grida.co/figma/ci" },
};

export default function RetiredFigmaCiPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center gap-6 px-6 py-24">
        <h1 className="text-3xl font-semibold">Figma CI has been retired</h1>
        <p className="text-muted-foreground">
          The legacy Grida CLI for importing Figma designs and generating code
          is no longer maintained. Its init, add and Flutter daemon commands are
          not part of the replacement CLI.
        </p>
        <p className="text-muted-foreground">
          The new Grida CLI is in preview, with account access and media
          generation tools. See the current documentation for available
          capabilities and setup instructions.
        </p>
        <a
          className="underline underline-offset-4"
          href="https://grida.co/docs/cli"
        >
          Read the Grida CLI docs
        </a>
      </main>
      <Footer />
    </>
  );
}
