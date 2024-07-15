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

const tags = [
  "Apple",
  "Banana",
  "Carrot",
  "Dog",
  "Elephant",
  "Flower",
  "Giraffe",
  "House",
  "Igloo",
  "Jacket",
  "Kite",
  "Lion",
  "Monkey",
  "Nurse",
  "Orange",
  "Piano",
  "Queen",
];

const list = [
  {
    date: "24.1.02",
    attendees: 200,
    title: "Tech meetup",
    cta: "register now",
    status: "Opens 1:11",
    image: "/images/bundle-abstract/001.png",
    tags: ["Apple", "Banana"],
  },
  {
    date: "15.2.02",
    attendees: 150,
    title: "AI Conference",
    cta: "sign up today",
    status: "Opens 2:00",
    image: "/images/bundle-abstract/002.png",
    tags: ["Apple", "Banana"],
  },
  {
    date: "03.3.02",
    attendees: 300,
    title: "Blockchain Expo",
    cta: "join now",
    status: "Opens 3:30",
    image: "/images/bundle-abstract/003.png",
    tags: ["Apple", "Banana"],
  },
  {
    date: "10.4.02",
    attendees: 250,
    title: "Cybersecurity Summit",
    cta: "reserve your spot",
    status: "Opens 4:00",
    image: "/images/bundle-abstract/004.png",
    tags: ["Apple", "Banana"],
  },
  // {
  //   date: "22.5.02",
  //   attendees: 180,
  //   title: "Cloud Computing Workshop",
  //   cta: "get tickets",
  //   status: "Opens 5:15",
  //   image: "/images/bundle-abstract/004.png",
  // },
];

export default function FormCollectionPage() {
  const [state] = useEditorState();
  return (
    <div className="@container/preview">
      <Header_001 />
      <SlotNode
        node_id="hero"
        component={Hero_002}
        defaultProperties={{
          h1: "The Bundle",
          p: "A collection of events and meetups for developers and designers.",
          media: {
            $id: "media",
            type: "video",
            src: "https://player.vimeo.com/progressive_redirect/playback/860123788/rendition/1080p/file.mp4?loc=external&log_user=0&signature=ac9c2e0d2e367d8a31af6490edad8c1f7bae87d085c4f3909773a7ca5a129cb6",
          },
        }}
      />
      <main className="container">
        <section>
          <header className="py-10">
            <SlotNode
              node_id="list-header-title"
              component={TemplateBuilderWidgets.Text}
              defaultProperties={{
                text: "Upcoming Events",
              }}
            />
            <div className="py-2">
              <Filter />
            </div>
          </header>
          {/* <Editable node_id="list"> */}
          <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
            {list.map((data, i) => (
              <SlotNode
                node_id={"event-card"}
                key={i}
                component={Card_003}
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

function Filter() {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      className="flex flex-wrap items-start justify-start"
    >
      {tags.map((tag) => (
        <ToggleGroupItem key={tag} value={tag} className="">
          {tag}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
