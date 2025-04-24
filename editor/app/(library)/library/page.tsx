import React from "react";
import Image from "next/image";
export default function () {
  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <input
          type="search"
          placeholder="Search resources..."
          className="input input-sm w-64"
        />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-2">Categories</h2>
        <div className="flex flex-wrap gap-2">
          {/* Category cards placeholder */}
          {["Fonts", "Icons", "Patterns", "3D"].map((category) => (
            <div
              key={category}
              className="bg-muted rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-muted-foreground/10"
            >
              {category}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Resources</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {/* Resource cards placeholder */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border p-3 hover:shadow-md transition-shadow"
            >
              <div className="aspect-video bg-gray-100 mb-2" />
              <div className="text-sm font-medium">Resource {i + 1}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
