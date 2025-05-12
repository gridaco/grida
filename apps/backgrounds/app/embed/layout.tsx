import React from "react";

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative h-screen w-screen">
      {/* Block all interactions */}
      <div className="fixed inset-0 z-50 pointer-events-auto bg-transparent" />
      {children}
    </main>
  );
}
