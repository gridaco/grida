import React from "react";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorState } from "@/scaffolds/editor";
import { Editable } from "@/scaffolds/canvas";
import { Hero_002 } from "../components/cards.hero";
import { Card_002 } from "../components/cards";

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
  },
  {
    date: "15.2.02",
    attendees: 150,
    title: "AI Conference",
    cta: "sign up today",
    status: "Opens 2:00",
    image: "/images/bundle-abstract/002.png",
  },
  {
    date: "03.3.02",
    attendees: 300,
    title: "Blockchain Expo",
    cta: "join now",
    status: "Opens 3:30",
    image: "/images/bundle-abstract/003.png",
  },
  {
    date: "10.4.02",
    attendees: 250,
    title: "Cybersecurity Summit",
    cta: "reserve your spot",
    status: "Opens 4:00",
    image: "/images/bundle-abstract/004.png",
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
      <Editable node_id="hero" component={Hero_002} props={{}} />
      <main className="container">
        <section>
          <header className="py-10">
            <h2 className="text-2xl font-semibold">Upcoming Events</h2>
            <div className="py-2">
              <Filter />
            </div>
          </header>
          {/* <Editable node_id="list"> */}
          <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
            {list.map((data, i) => (
              <Editable
                node_id={"event-card"}
                key={i}
                component={Card_002}
                props={{
                  image: data.image,
                  h1: data.title,
                  badge: data.status,
                  p: data.cta,
                  n: data.attendees,
                  date1: data.date,
                }}
              >
                <Card_002
                  key={i}
                  image={data.image}
                  h1={data.title}
                  badge={data.status}
                  p={data.cta}
                  n={data.attendees}
                  date1={data.date}
                />
              </Editable>
            ))}
          </div>
          {/* </Editable> */}
        </section>
      </main>
      <footer>
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
