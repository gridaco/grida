import Link from "next/link";

const packages = [
  {
    name: "@grida/ruler",
    description:
      "Zero-Dependency Canvas Ruler Component for Infinite Canvas. A lightweight, performant ruler component that supports zooming, panning, and custom markers.",
    demoPath: "/package/@grida/ruler",
    npmUrl: "https://www.npmjs.com/package/@grida/ruler",
    features: [
      "Zero dependencies",
      "High performance canvas-based rendering",
      "Support for zooming and panning",
      "Custom markers and ranges",
      "Customizable appearance",
      "Responsive design",
      "Both React and vanilla JS support",
    ],
  },
  {
    name: "@grida/transparency-grid",
    description:
      "Transparency Grid component for Infinite Canvas. A lightweight, performant transparency grid component that supports zooming, panning, and custom transformations.",
    demoPath: "/package/@grida/transparency-grid",
    npmUrl: "https://www.npmjs.com/package/@grida/transparency-grid",
    features: [
      "Zero dependencies",
      "High performance canvas-based rendering",
      "Support for zooming and panning",
      "Customizable appearance",
      "Responsive design",
      "Both React and vanilla JS support",
      "WebGPU support (experimental)",
    ],
  },
  {
    name: "@grida/pixel-grid",
    description:
      "A React component for rendering pixel-perfect grids in infinite canvas applications. This package provides a flexible and performant way to display grid patterns with zoom and pan capabilities.",
    demoPath: "/package/@grida/pixel-grid",
    npmUrl: "https://www.npmjs.com/package/@grida/pixel-grid",
    features: [
      "Pixel-perfect grid rendering",
      "Zoom and pan support",
      "Customizable grid appearance",
      "High performance with React",
      "Responsive design support",
    ],
  },
];

export default function PackagePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12">
        {/* Header Section */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Grida Canvas Packages</h1>
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
                    <h2 className="text-2xl font-semibold mb-2 group-hover:text-primary transition-colors">
                      {pkg.name}
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
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
                <div className="md:w-40 flex-shrink-0 space-y-3">
                  <Link
                    href={pkg.demoPath}
                    className="inline-flex items-center justify-center w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    View Demo
                  </Link>
                  <a
                    href={pkg.npmUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
                  >
                    View on npm
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
