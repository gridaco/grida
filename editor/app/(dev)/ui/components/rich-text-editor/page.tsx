"use client";

import React, { useState } from "react";
import { MinimalTiptapEditor } from "@/kits/minimal-tiptap";

export default function RichTextEditorPage() {
  const [content1, setContent1] = useState("");
  const [content2, setContent2] = useState(
    "<h2>Welcome to the Rich Text Editor</h2><p>This is a <strong>powerful</strong> and <em>flexible</em> editor with many features:</p><ul><li>Bold, italic, and underline formatting</li><li>Headings and lists</li><li>Links and code blocks</li><li>And much more!</li></ul>"
  );

  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Rich Text Editor</h1>
          <p className="text-gray-600">
            A powerful WYSIWYG editor built with Tiptap for creating rich
            content.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Basic Editor</h2>
            <p className="text-sm text-gray-600">
              Start with an empty editor and create content
            </p>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg">
            <MinimalTiptapEditor
              value={content1}
              onChange={(value) =>
                setContent1(
                  typeof value === "string"
                    ? value
                    : value
                      ? JSON.stringify(value)
                      : ""
                )
              }
              className="min-h-[200px]"
            />
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">
              Editor with Default Content
            </h2>
            <p className="text-sm text-gray-600">
              Editor pre-populated with formatted content
            </p>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg">
            <MinimalTiptapEditor
              value={content2}
              onChange={(value) =>
                setContent2(
                  typeof value === "string"
                    ? value
                    : value
                      ? JSON.stringify(value)
                      : ""
                )
              }
              className="min-h-[300px]"
            />
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Features</h2>
            <p className="text-sm text-gray-600">
              Supported formatting and features
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Text Formatting</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Bold, Italic, Underline</li>
                <li>• Strike-through</li>
                <li>• Code inline</li>
                <li>• Headings (H1-H6)</li>
                <li>• Paragraphs</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Content Blocks</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Bullet lists</li>
                <li>• Ordered lists</li>
                <li>• Blockquotes</li>
                <li>• Code blocks</li>
                <li>• Horizontal rules</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Advanced Features</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Links</li>
                <li>• Text alignment</li>
                <li>• Undo/Redo</li>
                <li>• Keyboard shortcuts</li>
                <li>• Markdown support</li>
              </ul>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Keyboard Shortcuts</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  • <kbd className="text-xs">Cmd/Ctrl + B</kbd> - Bold
                </li>
                <li>
                  • <kbd className="text-xs">Cmd/Ctrl + I</kbd> - Italic
                </li>
                <li>
                  • <kbd className="text-xs">Cmd/Ctrl + U</kbd> - Underline
                </li>
                <li>
                  • <kbd className="text-xs">Cmd/Ctrl + Z</kbd> - Undo
                </li>
                <li>
                  • <kbd className="text-xs">Cmd/Ctrl + Shift + Z</kbd> - Redo
                </li>
              </ul>
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Content Output</h2>
            <p className="text-sm text-gray-600">HTML output from the editor</p>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-sm">Editor 1 Content</h3>
              <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
                {content1 || "(empty)"}
              </pre>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-sm">Editor 2 Content</h3>
              <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
                {content2}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
