import { packages } from "./data";
import { NpmLogoIcon } from "@/components/logos/npm";
import { Button } from "@/components/ui/button";
import { BoxIcon } from "lucide-react";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Link from "next/link";

export default function PackagePage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />
      <div className="container mx-auto px-4 py-40">
        {/* Header Section */}
        <div className="max-w-3xl mx-auto text-center mb-12 flex flex-col justify-center items-center gap-4">
          <BoxIcon className="size-16 text-workbench-accent-sky" />
          <h1 className="text-4xl font-bold">Grida Canvas Packages</h1>
          <p className="text-muted-foreground text-lg">
            A collection of high-performance canvas components for building
            infinite canvas applications
          </p>
        </div>

        {/* Packages Grid */}
        <div className="grid gap-6 max-w-5xl mx-auto">
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              className="group relative bg-card border rounded-xl p-6 hover:border-primary/50 transition-all duration-200 hover:shadow-lg"
            >
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                {/* Left Content */}
                <div className="flex-1 space-y-4">
                  <div>
                    <h2 className="text-2xl font-semibold mb-2 font-mono">
                      {pkg.name}
                    </h2>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {pkg.description}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-3 text-muted-foreground">
                      Key Features
                    </h3>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {pkg.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-center text-sm text-muted-foreground"
                        >
                          <span className="mr-2 text-primary">•</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Right Content - Links */}
                <div className="flex-shrink-0 flex gap-2">
                  <Link href={pkg.demoPath} target="_blank">
                    <Button>Open Demo</Button>
                  </Link>
                  {pkg.npm && (
                    <Link
                      href={`https://npmjs.com/package/${pkg.name}`}
                      target="_blank"
                    >
                      <Button variant="outline">
                        <NpmLogoIcon className="size-10" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
