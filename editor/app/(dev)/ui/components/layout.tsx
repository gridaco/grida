import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ComponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-b bg-white sticky top-0 z-10">
        <div className="container max-w-screen-lg mx-auto py-3">
          <Link
            href="/ui"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Components
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
