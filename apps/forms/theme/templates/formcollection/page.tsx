import React from "react";
import { Card } from "@/components/ui/card";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { SlashIcon } from "@radix-ui/react-icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorState } from "@/scaffolds/editor";
import { Node } from "@/scaffolds/canvas";

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
      <Node node_id="hero">
        <Hero_002 />
      </Node>
      <main className="container">
        <section>
          <header className="py-10">
            <Node>
              <h2 className="text-2xl font-semibold">Upcoming Events</h2>
            </Node>
            <div className="py-2">
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
            </div>
          </header>
          <Node node_id="list">
            <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
              {list.map((data, i) => (
                <Node node_id={i.toString()} key={i}>
                  <Card_002
                    key={i}
                    image={data.image}
                    h1={data.title}
                    badge={data.status}
                    p={data.cta}
                    n={data.attendees}
                    date1={data.date}
                    caption={`${data.date} · ${data.attendees}`}
                  />
                </Node>
              ))}
            </div>
          </Node>
        </section>
      </main>
      <footer>
        <PoweredByGridaFooter />
      </footer>
    </div>
  );
}

function Hero_001() {
  return (
    <header>
      <div className="relative">
        <video
          className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
          autoPlay
          loop
          muted
          playsInline
          src="https://player.vimeo.com/progressive_redirect/playback/860123788/rendition/1080p/file.mp4?loc=external&log_user=0&signature=ac9c2e0d2e367d8a31af6490edad8c1f7bae87d085c4f3909773a7ca5a129cb6"
        />
        <div className="absolute bottom-8 bg-background max-w-md container py-4">
          <Node node_id="111">
            <h1 className="text-4xl font-semibold">The Bundle</h1>
            <p className="text-lg">
              A collection of events and meetups for developers and designers.
            </p>
          </Node>
        </div>
      </div>
    </header>
  );
}

function Hero_002() {
  return (
    <header>
      <div className="relative">
        <video
          className="w-full aspect-[3/4] @5xl/preview:aspect-video object-cover -z-10"
          autoPlay
          loop
          muted
          playsInline
          src="https://player.vimeo.com/progressive_redirect/playback/860123788/rendition/1080p/file.mp4?loc=external&log_user=0&signature=ac9c2e0d2e367d8a31af6490edad8c1f7bae87d085c4f3909773a7ca5a129cb6"
        />
        <HalfHeightGradient />
        <div className="text-background absolute bottom-8 max-w-md container py-4">
          <h1 className="text-4xl font-semibold">The Bundle</h1>
          <p className="text-lg">
            A collection of events and meetups for developers and designers.
          </p>
        </div>
      </div>
    </header>
  );
}

interface CardProps {
  badge: string;
  h1: string;
  p: string;
  date1: string;
  n: number;
  caption?: string;
  image: string;
}

function Card_001() {
  return (
    <Card className="group relative overflow-hidden rounded-lg shadow-lg transition-all hover:shadow-xl">
      {/* <Link href="#" className="absolute inset-0 z-10" prefetch={false}>
        <span className="sr-only">View event</span>
      </Link> */}
      <div className="flex overflow-hidden rounded-t-lg">
        <Image
          src="/images/abstract-placeholder.jpg"
          alt="Event thumbnail"
          width={800}
          height={400}
          className="h-full w-full aspect-[4/3] object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
        />
      </div>
      <div className="space-y-2 bg-background p-4">
        <h3 className="text-lg font-semibold text-foreground">Tech Meetup</h3>
        <div className="text-sm text-muted-foreground">
          <span>July 20, 2024</span>
          <span className="mx-2">·</span>
          <span>6:00 PM - 9:00 PM</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Hosted at The Innovation Hub
        </div>
      </div>
    </Card>
  );
}

function Card_002({ h1, p, date1, n, badge, image }: CardProps) {
  return (
    <Card className="relative overflow-hidden flex-1 flex flex-col justify-end gap-6 text-foreground w-auto aspect-[4/4]">
      <Image
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
        src={image}
        alt={""}
        layout="fill"
      />
      <Node>
        <HalfHeightGradient />
      </Node>
      <div className="absolute top-0 left-0 py-4 px-4">
        <Badge>{badge}</Badge>
      </div>
      <div className="text-background flex flex-col gap-1 z-20 py-8 px-4 pr-10">
        <div className="flex flex-row items-center gap-2">
          <div className="flex gap-2 items-center justify-between">
            <span>{date1}</span>
          </div>
          <SlashIcon />
          <span>
            <strong>{n}</strong>
          </span>
        </div>
        <h1 className="text-3xl font-bold break-keep max-w-[80%]">{h1}</h1>
        <p className="text-xs font-regular opacity-80">{p}</p>
      </div>
    </Card>
  );
}

function HalfHeightGradient() {
  return (
    <div
      className="absolute bottom-0 left-0 w-full h-2/5 z-0"
      style={{
        background:
          "linear-gradient(to top, hsl(var(--foreground)), transparent)",
      }}
    />
  );
}
