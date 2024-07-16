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
import * as ArrayBuilder from "@/builder/template-builder/widgets/array";

export default function FormCollectionPage() {
  const [state] = useEditorState();
  const data = samples[state.document.templatesample as keyof typeof samples];
  return (
    <div className="@container/preview">
      <Header_001 logo={data.brand.logo} />
      <SlotNode
        node_id="hero"
        component={Hero_002}
        defaultProperties={data.featured}
      />
      <main className="container">
        <section>
          <header className="py-10">
            <SlotNode
              node_id="list-header-title"
              component={TemplateBuilderWidgets.Text}
              defaultProperties={data.listheader}
            />
            <div className="py-2">
              <Filter tags={data.tags} />
            </div>
          </header>
          {/* <Editable node_id="list"> */}
          <ArrayBuilder.Provider data={data.events}>
            <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
              <ArrayBuilder.Builder>
                <ArrayBuilder.Item>
                  {(data) => (
                    <SlotNode
                      node_id={"event-card"}
                      component={Card_002}
                      defaultProperties={{
                        media: { $id: "media", type: "image", src: data.image },
                        // $.title
                        h1: data.title,
                        // $.status
                        badge: data.status,
                        // $.tags
                        tags: data.tags,
                        // $.cta
                        p: data.cta,
                        // $.attendees
                        n: data.attendees,
                        // $.date
                        date1: data.date,
                        date2: data.date,
                      }}
                    />
                  )}
                </ArrayBuilder.Item>
              </ArrayBuilder.Builder>
            </div>
          </ArrayBuilder.Provider>
        </section>
      </main>
      <footer>
        <Footer_001 />
        <PoweredByGridaFooter />
      </footer>
    </div>
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
