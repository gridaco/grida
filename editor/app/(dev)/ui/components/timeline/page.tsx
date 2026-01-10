"use client";

import React from "react";
import { Timeline } from "@/grida-react-timeline-wd";
import { ComponentDemo } from "../component-demo";

export default function TimelinePage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Timeline</h1>
          <p className="text-gray-600">
            A timeline component for displaying temporal data and animations.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Default Timeline</h2>
            <p className="text-sm text-gray-600">
              The standard timeline component for animation sequences
            </p>
          </div>
          <ComponentDemo>
            <div className="w-full max-w-4xl">
              <Timeline />
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Usage</h2>
            <p className="text-sm text-gray-600">
              The timeline component is designed for managing animation
              sequences and keyframes
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Features</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Time-based animation control</li>
                <li>• Keyframe management</li>
                <li>• Playback controls</li>
                <li>• Timeline scrubbing</li>
                <li>• Frame-by-frame navigation</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Use Cases</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Animation editors</li>
                <li>• Video editing tools</li>
                <li>• Motion design</li>
                <li>• Interactive presentations</li>
                <li>• Game development tools</li>
              </ul>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Interactive Demo</h2>
            <p className="text-sm text-gray-600">
              Explore the timeline component features
            </p>
          </div>
          <div className="space-y-4 p-6 bg-gray-50 rounded-lg">
            <Timeline />
            <div className="text-sm text-gray-600">
              <strong>Tips:</strong> Use the timeline controls to navigate
              through frames, add keyframes, and manage your animation
              sequences.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
