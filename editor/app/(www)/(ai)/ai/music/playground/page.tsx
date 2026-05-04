import type { Metadata } from "next";
import Header from "@/www/header";
import Footer from "@/www/footer";
import AudioGenTool from "./_page";

export const metadata: Metadata = {
  title: "Lyria 3 Playground — Generate Music with AI | Grida",
  description:
    "Generate music with Google Lyria 3 and Lyria 3 Pro. Type a prompt, optionally attach a reference image, and get 48kHz stereo audio in seconds.",
  keywords: [
    "lyria 3 playground",
    "ai music playground",
    "lyria 3 pro",
    "google lyria",
    "text to music",
    "image to music",
    "music generation",
  ],
  openGraph: {
    title: "Lyria 3 Playground — Generate Music with AI | Grida",
    description:
      "Generate music with Google Lyria 3 and Lyria 3 Pro from a prompt or reference image.",
    type: "website",
    url: "https://grida.co/ai/music/playground",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lyria 3 Playground — Generate Music with AI | Grida",
    description:
      "Generate music with Google Lyria 3 and Lyria 3 Pro from a prompt or reference image.",
  },
};

export default async function MusicPlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
  const initialPrompt = typeof raw === "string" ? raw.slice(0, 4000) : "";

  return (
    <main>
      <Header />
      <AudioGenTool initialPrompt={initialPrompt} />
      <Footer />
    </main>
  );
}
