"use client";

import React from "react";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorState } from "@/scaffolds/editor";
import { SlotNode } from "@/builder/template-builder/node";
import {
  Card_002,
  Card_003,
  Hero_002,
} from "@/builder/template-builder/components/cards";
import { Footer_001 } from "@/builder/template-builder/components/footers";
import { TemplateBuilderWidgets } from "@/builder/template-builder/widgets";
import { Header_001 } from "@/builder/template-builder/components/headers";
import * as samples from "./samples";
import {
  RootDataContextProvider,
  DataProvider,
  ScopedVariableProvider,
} from "@/builder/core/data-context";
import { Factory } from "@/ast/factory";
import ArrayMap from "@/builder/core/data-context/array";

export default function FormCollectionPage() {
  const [state] = useEditorState();
  const data = samples[state.document.templatesample as keyof typeof samples];
  return (
    <RootDataContextProvider>
      <DataProvider namespace="dummy" initialData={data}>
        <div className="@container/preview">
          <Header_001 logo={data.brand.logo} />
          <SlotNode
            node_id="hero"
            component={Hero_002}
            defaultProperties={{
              h1: Factory.createPropertyAccessExpression<typeof data>([
                "featured",
                "h1",
              ]),
              media: Factory.createPropertyAccessExpression<typeof data>([
                "featured",
                "media",
              ]),
              p: Factory.createPropertyAccessExpression<typeof data>([
                "featured",
                "p",
              ]),
            }}
          />
          <main className="container">
            <section>
              <header className="py-10">
                <SlotNode
                  node_id="list-header-title"
                  component={TemplateBuilderWidgets.Text}
                  defaultText={Factory.createPropertyAccessExpression<
                    typeof data
                  >(["listheader", "text"])}
                  defaultStyle={{
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                />
                <div className="py-2">
                  <Filter tags={data.tags} />
                </div>
              </header>
              <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
                <ArrayMap identifier="event" expression={["events"]}>
                  {(data) => (
                    <SlotNode
                      node_id={"event-card"}
                      component={Card_002}
                      defaultProperties={{
                        media: {
                          $id: "media",
                          type: "image",
                          src: data.image, // TODO:L property access within static nested data
                        },
                        h1: Factory.createPropertyAccessExpression([
                          "event",
                          "title",
                        ]),
                        badge: Factory.createPropertyAccessExpression([
                          "event",
                          "status",
                        ]),
                        tags: Factory.createPropertyAccessExpression([
                          "event",
                          "tags",
                        ]),
                        p: Factory.createPropertyAccessExpression([
                          "event",
                          "cta",
                        ]),
                        n: Factory.createPropertyAccessExpression([
                          "event",
                          "attendees",
                        ]),
                        date1: Factory.createPropertyAccessExpression([
                          "event",
                          "date",
                        ]),
                        date2: Factory.createPropertyAccessExpression([
                          "event",
                          "date",
                        ]),
                      }}
                    />
                  )}
                </ArrayMap>
              </div>
            </section>
          </main>
          <footer>
            <Footer_001 />
            <PoweredByGridaFooter />
          </footer>
        </div>
      </DataProvider>
    </RootDataContextProvider>
  );
}

function Filter({ tags }: { tags: string[] }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      className="flex flex-wrap items-start justify-start"
    >
      {tags.map((tag) => (
        <ToggleGroupItem key={tag} value={tag} className="text-xs">
          {tag}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
