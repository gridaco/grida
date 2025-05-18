import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ArrowRight,
  FormInput,
  PenTool,
  Image as ImageIcon,
} from "lucide-react";
import Header from "@/www/header";
import Footer from "@/www/footer";

export default function PlaygroundPage() {
  const menuItems = [
    {
      title: "Forms Playground",
      description: "Experiment with different form components and layouts",
      href: "/playground/forms",
      gradient: "from-blue-500/20 to-cyan-500/20",
      icon: FormInput,
    },
    {
      title: "Canvas Playground",
      description: "Explore canvas-based interactions and drawings",
      href: "/canvas",
      gradient: "from-purple-500/20 to-pink-500/20",
      icon: PenTool,
    },
    {
      title: "Image Playground",
      description: "Test image processing and manipulation features",
      href: "/playground/image",
      gradient: "from-orange-500/20 to-red-500/20",
      icon: ImageIcon,
    },
  ];

  return (
    <main>
      <Header className="relative" />
      <div className="container mx-auto my-40">
        <div className="mb-16">
          <h1 className="text-4xl font-bold text-foreground mb-4 bg-clip-text bg-gradient-to-r from-foreground to-foreground/70">
            Playground
          </h1>
          <p className="text-base text-muted-foreground max-w-xl">
            Explore different playgrounds to test and experiment with various
            features
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group block transition-all duration-300 hover:scale-[1.02]"
            >
              <Card
                className={`h-full relative overflow-hidden bg-gradient-to-br ${item.gradient} backdrop-blur-sm border-0`}
              >
                <div className="absolute inset-0 bg-background/50" />
                <CardHeader className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-background/50">
                        <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <CardTitle className="text-xl mb-1.5 group-hover:text-primary transition-colors">
                          {item.title}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {item.description}
                        </CardDescription>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
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
