"use client";

import React from "react";
import OriginComp569 from "../../comp/comp-569";
import { ComponentDemo } from "../component-demo";

export default function TreePage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Tree Component</h1>
          <p className="text-gray-600">
            A hierarchical tree view with drag-and-drop, multi-select, and
            keyboard navigation powered by headless-tree.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Interactive Tree</h2>
            <p className="text-sm text-gray-600">
              Try expanding/collapsing folders, selecting items, and dragging to
              reorder
            </p>
          </div>
          <ComponentDemo className="min-h-[400px]">
            <div className="w-full max-w-2xl">
              <OriginComp569 />
            </div>
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Features</h2>
            <p className="text-sm text-gray-600">
              Full-featured tree component capabilities
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Navigation</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Click to expand/collapse folders</li>
                <li>• Arrow keys for navigation</li>
                <li>• Single and multi-select</li>
                <li>• Keyboard shortcuts</li>
                <li>• Focus management</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Drag and Drop</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Drag items to reorder</li>
                <li>• Drop into folders</li>
                <li>• Visual drop indicators</li>
                <li>• Keyboard drag and drop</li>
                <li>• Constraint-based dropping</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Accessibility</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• ARIA labels and roles</li>
                <li>• Screen reader support</li>
                <li>• Live regions for updates</li>
                <li>• Keyboard-only operation</li>
                <li>• Focus indicators</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Customization</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Custom item rendering</li>
                <li>• Configurable indent</li>
                <li>• Folder icons</li>
                <li>• Styling support</li>
                <li>• Event handlers</li>
              </ul>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Keyboard Shortcuts</h2>
            <p className="text-sm text-gray-600">
              Navigate and interact with the tree using keyboard
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-gray-50 rounded-lg">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  ↑ ↓
                </kbd>
                <span className="text-sm">Navigate up/down</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  ← →
                </kbd>
                <span className="text-sm">Collapse/expand folder</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  Enter
                </kbd>
                <span className="text-sm">Select/activate item</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  Space
                </kbd>
                <span className="text-sm">Toggle selection</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  Cmd/Ctrl + A
                </kbd>
                <span className="text-sm">Select all</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  Shift + ↑ ↓
                </kbd>
                <span className="text-sm">Range select</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  Cmd/Ctrl + Click
                </kbd>
                <span className="text-sm">Multi-select</span>
              </div>
              <div className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-white border rounded text-xs">
                  Home / End
                </kbd>
                <span className="text-sm">First/last item</span>
              </div>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Use Cases</h2>
            <p className="text-sm text-gray-600">
              Common applications for tree components
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">File Explorers</h3>
              <p className="text-sm text-gray-600">
                Navigate and organize files and folders with familiar tree
                interactions
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Layer Panels</h3>
              <p className="text-sm text-gray-600">
                Manage design layers and components in visual editors
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Organization Charts</h3>
              <p className="text-sm text-gray-600">
                Display hierarchical structures like company departments
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
