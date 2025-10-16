"use client";

import React, { useState } from "react";
import { TagInput } from "@/components/tag";

export default function TagsPage() {
  const [tags, setTags] = useState<{ id: string; text: string }[]>([
    { id: "react", text: "react" },
    { id: "typescript", text: "typescript" },
  ]);
  const [tagsWithAutocomplete, setTagsWithAutocomplete] = useState<
    { id: string; text: string }[]
  >([]);
  const [emptyTags, setEmptyTags] = useState<{ id: string; text: string }[]>(
    []
  );

  const autocompleteOptions = [
    { id: "apple", text: "apple" },
    { id: "banana", text: "banana" },
    { id: "cherry", text: "cherry" },
    { id: "date", text: "date" },
    { id: "elderberry", text: "elderberry" },
    { id: "fig", text: "fig" },
    { id: "grape", text: "grape" },
    { id: "honeydew", text: "honeydew" },
    { id: "kiwi", text: "kiwi" },
    { id: "lemon", text: "lemon" },
    { id: "mango", text: "mango" },
    { id: "orange", text: "orange" },
    { id: "papaya", text: "papaya" },
    { id: "raspberry", text: "raspberry" },
    { id: "strawberry", text: "strawberry" },
  ];

  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Tag Input</h1>
          <p className="text-gray-600">
            A flexible tag input component with autocomplete support for
            managing multiple values.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Basic Usage</h2>
            <p className="text-sm text-gray-600">
              Create and manage tags with keyboard support
            </p>
          </div>
          <div className="space-y-4 p-6 bg-gray-50 rounded-lg">
            <TagInput
              tags={tags}
              setTags={setTags}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
            <div className="text-sm text-gray-600">
              <strong>Tips:</strong> Type and press Enter to add tags. Click on
              a tag to remove it.
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">With Autocomplete</h2>
            <p className="text-sm text-gray-600">
              Enable autocomplete suggestions for faster input
            </p>
          </div>
          <div className="space-y-4 p-6 bg-gray-50 rounded-lg">
            <TagInput
              tags={tagsWithAutocomplete}
              setTags={setTagsWithAutocomplete}
              enableAutocomplete
              autocompleteOptions={autocompleteOptions}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
            <div className="text-sm text-gray-600">
              <strong>Tips:</strong> Start typing to see autocomplete
              suggestions. Select from the dropdown or create custom tags.
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Empty State</h2>
            <p className="text-sm text-gray-600">
              Tag input without any initial values
            </p>
          </div>
          <div className="space-y-4 p-6 bg-gray-50 rounded-lg">
            <TagInput
              tags={emptyTags}
              setTags={setEmptyTags}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
            <div className="text-sm text-gray-600">
              Start typing to add your first tag.
            </div>
          </div>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Current Tags</h2>
            <p className="text-sm text-gray-600">View all active tags</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-sm">Basic Tags</h3>
              <div className="space-y-1">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <div key={tag.id} className="text-sm text-gray-600">
                      • {tag.text}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400 italic">No tags</div>
                )}
              </div>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-sm">Autocomplete Tags</h3>
              <div className="space-y-1">
                {tagsWithAutocomplete.length > 0 ? (
                  tagsWithAutocomplete.map((tag) => (
                    <div key={tag.id} className="text-sm text-gray-600">
                      • {tag.text}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400 italic">No tags</div>
                )}
              </div>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-sm">Empty Tags</h3>
              <div className="space-y-1">
                {emptyTags.length > 0 ? (
                  emptyTags.map((tag) => (
                    <div key={tag.id} className="text-sm text-gray-600">
                      • {tag.text}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400 italic">No tags</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
