import type { Metadata } from "next";
import { AiCredits } from "@/lib/ai/credits";
import { resolveInitialAiCredits } from "@/lib/ai/credits/actions";

// Server Actions inherit this segment's duration; allow slow image generation.
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Image Playground",
  description: "Playground for generating images",
};

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initial = await resolveInitialAiCredits();
  return <AiCredits.Provider initial={initial}>{children}</AiCredits.Provider>;
}
