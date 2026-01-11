import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "UI Components | Grida",
  description:
    "Explore our collection of UI components with interactive demos and documentation.",
};

export default function UIComponentsIndexPage() {
  const components = [
    {
      name: "Degree Control",
      href: "/ui/components/degree",
      description:
        "A rotary control for selecting angles with keyboard and mouse support",
    },
    {
      name: "Spinner",
      href: "/ui/components/spinner",
      description: "Loading indicator for displaying loading states",
    },
    {
      name: "Progress",
      href: "/ui/components/progress",
      description: "Progress bars for task completion and loading states",
    },
    {
      name: "Rich Text Editor",
      href: "/ui/components/rich-text-editor",
      description: "Powerful WYSIWYG editor for creating rich content",
    },
    {
      name: "Timeline",
      href: "/ui/components/timeline",
      description: "Timeline component for animation sequences",
    },
    {
      name: "Tree",
      href: "/ui/components/tree",
      description: "Hierarchical tree view with drag-and-drop and multi-select",
    },
  ];

  const forms = [
    {
      name: "Email Challenge",
      href: "/ui/components/email-challenge",
      description:
        "Email input with embedded challenge UI (send code + verify OTP)",
    },
    {
      name: "Tag Input",
      href: "/ui/components/tags",
      description: "Tag input with autocomplete for managing multiple values",
    },
    {
      name: "Phone Input",
      href: "/ui/components/phone-input",
      description: "International phone number input with country selection",
    },
  ];

  const showcases = [
    {
      name: "Multiplayer",
      href: "/ui/multiplayer",
      description:
        "Real-time collaborative features with live cursors and presence",
    },
    {
      name: "Gradient Editor",
      href: "/ui/gradient-editor",
      description:
        "Professional gradient editor with linear, radial, and sweep gradients",
    },
    {
      name: "Media Player",
      href: "/ui/media-player",
      description: "Audio and video player with custom controls and artwork",
    },
    {
      name: "Lasso",
      href: "/ui/lasso",
      description: "Freeform polygon selection tool for interactive canvas",
    },
    {
      name: "Frames",
      href: "/ui/frames",
      description: "Browser frames and device mockups for content presentation",
    },
  ];

  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">UI Components</h1>
          <p className="text-gray-600">
            Explore our collection of UI components with interactive demos and
            documentation.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Component Library</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {components.map((component) => (
              <Link
                key={component.href}
                href={component.href}
                className="p-6 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
              >
                <h3 className="font-semibold text-lg mb-2 group-hover:text-blue-500 transition-colors">
                  {component.name}
                </h3>
                <p className="text-sm text-gray-600">{component.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Forms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forms.map((form) => (
              <Link
                key={form.href}
                href={form.href}
                className="p-6 border rounded-lg hover:border-green-500 hover:shadow-md transition-all group"
              >
                <h3 className="font-semibold text-lg mb-2 group-hover:text-green-500 transition-colors">
                  {form.name}
                </h3>
                <p className="text-sm text-gray-600">{form.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Showcases</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {showcases.map((showcase) => (
              <Link
                key={showcase.href}
                href={showcase.href}
                className="p-6 border rounded-lg hover:border-purple-500 hover:shadow-md transition-all group"
              >
                <h3 className="font-semibold text-lg mb-2 group-hover:text-purple-500 transition-colors">
                  {showcase.name}
                </h3>
                <p className="text-sm text-gray-600">{showcase.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
