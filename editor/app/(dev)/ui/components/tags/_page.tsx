"use client";

import React, { useState } from "react";
import { TagInput } from "@/components/tag";
import { ComponentDemo } from "../component-demo";

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
  const [coloredTags, setColoredTags] = useState<
    { id: string; text: string; color?: string }[]
  >([{ id: "urgent", text: "urgent", color: "#ef4444" }]);

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

  const coloredAutocompleteOptions = [
    { id: "urgent", text: "urgent", color: "#ef4444" },
    { id: "review", text: "review", color: "#f59e0b" },
    { id: "planned", text: "planned", color: "#3b82f6" },
    { id: "done", text: "done", color: "#22c55e" },
    { id: "blocked", text: "blocked", color: "#a855f7" },
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
          <ComponentDemo
            notes={
              <>
                <strong>Tips:</strong> Type and press Enter to add tags. Click
                on a tag to remove it.
              </>
            }
          >
            <TagInput
              tags={tags}
              setTags={setTags}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">With Autocomplete</h2>
            <p className="text-sm text-gray-600">
              Enable autocomplete suggestions for faster input
            </p>
          </div>
          <ComponentDemo
            notes={
              <>
                <strong>Tips:</strong> Start typing to see autocomplete
                suggestions. Select from the dropdown or create custom tags.
              </>
            }
          >
            <TagInput
              tags={tagsWithAutocomplete}
              setTags={setTagsWithAutocomplete}
              enableAutocomplete
              autocompleteOptions={autocompleteOptions}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">With Colors</h2>
            <p className="text-sm text-gray-600">
              Autocomplete and selected tags can be color-coded.
            </p>
          </div>
          <ComponentDemo
            notes={
              <>
                <strong>Tips:</strong> Pick from the colored suggestions to see
                the chips tinted, Notion-style.
              </>
            }
          >
            <TagInput
              tags={coloredTags}
              setTags={setColoredTags}
              enableAutocomplete
              autocompleteOptions={coloredAutocompleteOptions}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Empty State</h2>
            <p className="text-sm text-gray-600">
              Tag input without any initial values
            </p>
          </div>
          <ComponentDemo notes="Start typing to add your first tag.">
            <TagInput
              tags={emptyTags}
              setTags={setEmptyTags}
              activeTagIndex={null}
              setActiveTagIndex={() => {}}
            />
          </ComponentDemo>
        </section>
      </div>
    </main>
  );
}
