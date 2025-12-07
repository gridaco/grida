import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Link from "next/link";
import { CodeIcon, FigmaIcon, FrameIcon, ImageIcon } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grida Tools | Free Developer & Design Tools",
  description:
    "Free tools for developers and designers. Generate blob designs, halftone patterns, format phone numbers, inspect Figma files, and test AI image models.",
  keywords: [
    "free tools",
    "developer tools",
    "design tools",
    "blob generator",
    "halftone generator",
    "figma inspector",
    "phone number formatter",
    "image playground",
    "ai tools",
  ],
  openGraph: {
    title: "Grida Tools | Free Developer & Design Tools",
    description:
      "Free tools for developers and designers. Generate blob designs, halftone patterns, format phone numbers, inspect Figma files, and test AI image models.",
    type: "website",
    url: "https://grida.co/tools",
  },
};

type Tool = {
  title: string;
  description: string;
  link: string;
  icon: React.ComponentType<{ className?: string }>;
};

const categories: { name: string; tools: Tool[] }[] = [
  {
    name: "Design Tools",
    tools: [
      {
        title: "Blobs Generator",
        description: "Generate random blob designs.",
        link: "/tools/blobs",
        icon: FrameIcon,
      },
      {
        title: "Halftone Generator",
        description: "Generate halftone patterns from images.",
        link: "/tools/halftone",
        icon: ImageIcon,
      },
    ],
  },
  {
    name: "Developer Tools",
    tools: [
      {
        title: ".fig Inspector",
        description: "Parse and inspect Figma .fig files and clipboard data",
        link: "/tools/fig",
        icon: FigmaIcon,
      },
      {
        title: "E.164 Phone Number Tool",
        description: "Format phone numbers to E.164 format.",
        link: "/tools/e164",
        icon: CodeIcon,
      },
    ],
  },
  {
    name: "AI & Testing",
    tools: [
      {
        title: "Image Playground",
        description: "Test & Evaluate Image Models.",
        link: "/playground/image",
        icon: ImageIcon,
      },
    ],
  },
];

export default function ToolsPage() {
  return (
    <main>
      <Header />
      <div className="container mx-auto px-4 pt-24 md:pt-28 xl:pt-36 pb-24 md:pb-32 min-h-screen">
        <div className="max-w-5xl mx-auto">
          <header className="mb-20 text-left">
            <h1 className="text-3xl font-semibold tracking-tight mb-4">
              Grida Tools
            </h1>
            <p className="text-muted-foreground text-sm font-light">
              Free tools for developers and designers
            </p>
          </header>

          <div className="space-y-16">
            {categories.map((category, categoryIndex) => (
              <section key={category.name}>
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    {category.name}
                  </h2>
                  <div className="h-px w-12 bg-border mt-2" />
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {category.tools.map((tool) => (
                    <Link
                      href={tool.link}
                      key={tool.link}
                      className="group block"
                    >
                      <Card className="h-full border transition-all duration-200 hover:border-foreground/20 hover:shadow-sm">
                        <CardHeader className="pb-4">
                          <div className="flex items-start gap-3 mb-2">
                            <div className="mt-0.5 p-1.5 rounded-md bg-muted/50 group-hover:bg-muted transition-colors">
                              <tool.icon className="size-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base font-medium leading-tight mb-1.5 group-hover:underline">
                                {tool.title}
                              </CardTitle>
                              <CardDescription className="text-sm leading-relaxed">
                                {tool.description}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
