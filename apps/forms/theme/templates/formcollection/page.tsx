import { Card } from "@/components/ui/card";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import React from "react";
import { cn } from "@/utils";

export default function FormCollectionPage() {
  return (
    <div className="@container/preview">
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
            <h1 className="text-4xl font-semibold">The Bundle</h1>
            <p className="text-lg">
              A collection of events and meetups for developers and designers.
            </p>
          </div>
        </div>
      </header>
      <main className="container">
        <section>
          <header className="py-10">
            <h2 className="text-2xl font-semibold">Upcoming Events</h2>
            <div className="py-2">
              <div className="flex gap-2 flex-wrap">
                {["A", "B", "C", "D", "E", "F", "G"].map((tag) => (
                  <Badge className="cursor-pointer" key={tag}>
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </header>
          <TemplateComponent>
            <div className="grid gap-6 grid-cols-1 @3xl/preview:grid-cols-2 @5xl/preview:grid-cols-3 @7xl/preview:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <TemplateComponent key={i}>
                  <Card_001 key={i} />
                </TemplateComponent>
              ))}
            </div>
          </TemplateComponent>
        </section>
      </main>
      <footer>
        <PoweredByGridaFooter />
      </footer>
    </div>
  );
}

function TemplateComponent({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className={cn("relative")}>
      <div className={cn("absolute inset-0 z-10")} />
      {children}
    </div>
  );
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
