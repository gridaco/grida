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
          <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
            {data.events.map((data, i) => (
              <SlotNode
                node_id={"event-card"}
                key={i}
                component={Card_002}
                defaultProperties={{
                  media: { $id: "media", type: "image", src: data.image },
                  h1: data.title,
                  badge: data.status,
                  tags: data.tags,
                  p: data.cta,
                  n: data.attendees,
                  date1: data.date,
                  date2: data.date,
                }}
              />
            ))}
          </div>
          {/* </Editable> */}
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
