import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Link from "next/link";
import { CodeIcon, FrameIcon, ImageIcon } from "lucide-react";

const menus = [
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
  {
    title: "Image Playground",
    description: "Test & Evaluate Image Models.",
    link: "/playground/image",
    icon: ImageIcon,
  },
  {
    title: "E.164 Phone Number Tool",
    description: "Format phone numbers to E.164 format.",
    link: "/tools/e164",
    icon: CodeIcon,
  },
];

export default function ToolsPage() {
  return (
    <main>
      <Header />
      <div className="container mx-auto py-40 min-h-screen flex flex-col items-center justify-center">
        <div className="w-full grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {menus.map((menu, i) => (
            <Link href={menu.link} key={i}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <menu.icon className="size-5" />
                    {menu.title}
                  </CardTitle>
                  <CardDescription>{menu.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
