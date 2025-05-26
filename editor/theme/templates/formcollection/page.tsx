"use client";

import React from "react";
import { PoweredByGridaFooter } from "@/grida-forms-hosted/e/powered-by-brand-footer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NodeElement } from "@/grida-react-canvas/nodes/node";
import {
  Card_002,
  Card_003,
  Hero_002,
} from "@/grida-react-canvas/template-builder/components/cards";
import { Footer_001 } from "@/grida-react-canvas/template-builder/components/footers";
import { Header_001 } from "@/grida-react-canvas/template-builder/components/headers";
import * as samples from "./samples";
import {
  ProgramDataContextHost,
  DataProvider,
} from "@/grida-react-program-context/data-context";
import ArrayMap from "@/grida-react-program-context/data-context/array";
import { useDocument } from "@/grida-react-canvas/provider";
import assert from "assert";

type ISample = (typeof samples)[keyof typeof samples];

export default function FormCollectionPage() {
  const { document } = useDocument();

  // FIXME: UNKNOWN
  const root = document.nodes["root"];
  assert(root.type === "template_instance");
  const { props: props } = root;

  return (
    <ProgramDataContextHost>
      <DataProvider namespace="dummy" data={props}>
        <div className="@container/preview">
          <Header_001
            logo={
              // @ts-expect-error
              props["brand"]?.["logo"] as string
            }
          />
          <NodeElement
            node_id="hero"
            // name="Hero"
            component={Hero_002}
            // defaultProperties={{
            //   h1: Factory.createPropertyAccessExpression<ISample>([
            //     "featured",
            //     "h1",
            //   ]),
            //   media: Factory.createPropertyAccessExpression<ISample>([
            //     "featured",
            //     "media",
            //   ]),
            //   p: Factory.createPropertyAccessExpression<ISample>([
            //     "featured",
            //     "p",
            //   ]),
            // }}
          />
          <main className="container">
            <section>
              <header className="py-10">
                <NodeElement
                  node_id="list-header-title"
                  // name="List Header Title"
                  // text={Factory.createPropertyAccessExpression<ISample>([
                  //   "listheader",
                  //   "text",
                  // ])}
                  style={
                    {
                      // fontSize: 24,
                      // fontWeight: 700,
                    }
                  }
                />
                <div className="py-2">
                  <Filter tags={props.tags as any as string[]} />
                </div>
              </header>
              <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
                <ArrayMap identifier="event" expression={["events"]}>
                  {(data) => (
                    <NodeElement
                      node_id={"event-card"}
                      // name="Event Card"
                      component={Card_002}
                      // defaultProperties={{
                      //   media: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "media",
                      //   ]),
                      //   h1: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "title",
                      //   ]),
                      //   badge: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "status",
                      //   ]),
                      //   tags: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "tags",
                      //   ]),
                      //   p: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "cta",
                      //   ]),
                      //   n: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "attendees",
                      //   ]),
                      //   date1: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "date",
                      //   ]),
                      //   date2: Factory.createPropertyAccessExpression([
                      //     "event",
                      //     "date",
                      //   ]),
                      // }}
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
    </ProgramDataContextHost>
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
