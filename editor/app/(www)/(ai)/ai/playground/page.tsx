import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@app/ui/components/card";
import { FormInput, Image as ImageIcon, Music2 } from "lucide-react";
import Header from "@/www/header";
import Footer from "@/www/footer";

export const metadata: Metadata = {
  title: "AI Playground — Grida",
  description:
    "A universal playground for Grida's AI tools — generate music, images, and forms from a prompt.",
  keywords: [
    "ai playground",
    "ai music",
    "ai image generation",
    "ai forms",
    "grida ai",
  ],
  openGraph: {
    title: "AI Playground — Grida",
    description:
      "A universal playground for Grida's AI tools — generate music, images, and forms from a prompt.",
    type: "website",
    url: "https://grida.co/ai/playground",
  },
};

type Item = {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const items: Item[] = [
  {
    title: "Music",
    description: "Generate music with Google Lyria 3 and Lyria 3 Pro.",
    href: "/ai/playground/music",
    icon: Music2,
  },
  {
    title: "Image",
    description: "Generate and edit images from a prompt.",
    href: "/playground/image",
    icon: ImageIcon,
  },
  {
    title: "Forms",
    description: "Generate form schemas with AI.",
    href: "/forms/ai",
    icon: FormInput,
  },
];

export default function AiPlaygroundPage() {
  return (
    <main>
      <Header />
      <div className="container mx-auto px-4 pt-24 md:pt-28 xl:pt-36 pb-24 md:pb-32 min-h-screen">
        <div className="max-w-5xl mx-auto">
          <header className="mb-20 text-left">
            <h1 className="text-3xl font-semibold tracking-tight mb-4">
              AI Playground
            </h1>
            <p className="text-muted-foreground text-sm font-light">
              Generate music, images, and forms from a prompt.
            </p>
          </header>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Link href={item.href} key={item.href} className="group block">
                <Card className="h-full border transition-all duration-200 hover:border-foreground/20 hover:shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="mt-0.5 p-1.5 rounded-md bg-muted/50 group-hover:bg-muted transition-colors">
                        <item.icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base font-medium leading-tight mb-1.5 group-hover:underline">
                          {item.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {item.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
