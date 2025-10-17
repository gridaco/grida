"use client";

import React from "react";
import { Safari, SafariToolbar } from "@/components/frames/safari";

export default function FramesPage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Frames</h1>
          <p className="text-gray-600">
            Browser frames and device mockups for content presentation and
            showcases.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Safari Browser Frame</h2>
            <p className="text-sm text-gray-600">
              macOS Safari-style browser frame with toolbar
            </p>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg">
            <Safari className="w-full max-w-4xl mx-auto aspect-[16/10]">
              <SafariToolbar url="https://grida.co" />
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-center space-y-4 p-8">
                  <h3 className="text-4xl font-bold text-gray-900">
                    Welcome to Grida
                  </h3>
                  <p className="text-lg text-gray-600">
                    Design, code, and publish in one place
                  </p>
                </div>
              </div>
            </Safari>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">With Custom Content</h2>
            <p className="text-sm text-gray-600">
              Frame your UI screenshots and designs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Safari className="w-full aspect-video">
                <SafariToolbar url="app.example.com" />
                <div className="w-full h-full bg-white p-8">
                  <div className="space-y-4">
                    <div className="h-12 bg-gray-200 rounded animate-pulse" />
                    <div className="h-32 bg-gray-100 rounded" />
                    <div className="grid grid-cols-3 gap-4">
                      <div className="h-24 bg-gray-200 rounded" />
                      <div className="h-24 bg-gray-200 rounded" />
                      <div className="h-24 bg-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              </Safari>
              <p className="text-xs text-gray-500 text-center">
                Dashboard mockup
              </p>
            </div>
            <div className="space-y-2">
              <Safari className="w-full aspect-video">
                <SafariToolbar url="docs.example.com" />
                <div className="w-full h-full bg-gradient-to-br from-green-50 to-teal-50 p-8">
                  <div className="space-y-3">
                    <div className="h-8 bg-white/50 rounded w-3/4" />
                    <div className="h-4 bg-white/30 rounded" />
                    <div className="h-4 bg-white/30 rounded w-5/6" />
                    <div className="h-4 bg-white/30 rounded w-4/6" />
                  </div>
                </div>
              </Safari>
              <p className="text-xs text-gray-500 text-center">
                Documentation page
              </p>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Features</h2>
            <p className="text-sm text-gray-600">
              Professional presentation for your designs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Browser Chrome</h3>
              <p className="text-sm text-gray-600">
                Authentic Safari-style toolbar with URL bar, buttons, and
                controls
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Responsive</h3>
              <p className="text-sm text-gray-600">
                Scales beautifully at any size while maintaining proportions
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Customizable</h3>
              <p className="text-sm text-gray-600">
                Add any content inside - images, videos, or interactive
                components
              </p>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Use Cases</h2>
            <p className="text-sm text-gray-600">
              Perfect for various presentation needs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg space-y-2">
              <h3 className="font-semibold">Marketing Materials</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Landing page screenshots</li>
                <li>• Product demos and previews</li>
                <li>• Feature showcases</li>
                <li>• Social media graphics</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg space-y-2">
              <h3 className="font-semibold">Documentation</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Tutorial screenshots</li>
                <li>• UI/UX case studies</li>
                <li>• Design system showcases</li>
                <li>• Portfolio presentations</li>
              </ul>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Available Frames</h2>
            <p className="text-sm text-gray-600">
              Different frame styles for various contexts
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Safari</h3>
              <p className="text-sm text-gray-600 mb-4">
                macOS Safari browser frame with realistic chrome
              </p>
              <Safari className="w-full max-w-2xl aspect-[16/9]">
                <SafariToolbar url="grida.co" />
                <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-pink-50" />
              </Safari>
            </div>
          </div>
          <p className="text-sm text-gray-500 italic">
            More frame styles (Mail, Messages, etc.) are available in the
            components library.
          </p>
        </section>
      </div>
    </main>
  );
}
