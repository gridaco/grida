import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import React from "react";
import { CalendarBoxIcon, LocationBoxIcon } from "../components/icons";
import { MapGL } from "../components/mapgl";
import dummy from "../data/01.dummy.json";
import { TwitterLogoIcon } from "@radix-ui/react-icons";
import { YoutubeIcon } from "lucide-react";

const data = dummy;

export default function FormStartPage() {
  return (
    <main className="@container/preview">
      <header className="p-4">
        <GridaLogo />
      </header>
      <div className="@2xl/preview:container max-w-4xl @2xl/preview:flex-row w-fit mx-auto flex gap-0 md:gap-10 flex-col justify-center">
        <aside>
          <section className="mt-10">
            <Image
              className="aspect-square rounded-md overflow-hidden object-cover max-w-sm mx-auto shadow-2xl @2xl/preview:max-w-60 @3xl/preview:max-w-80"
              width={960}
              height={960}
              src="/images/abstract-placeholder.jpg"
              alt=""
            />
          </section>
        </aside>
        <aside className="flex-1 md:max-w-xl">
          <section className="p-4 mt-10">
            <div className="text-4xl font-bold">
              <h1 className="">{data.title}</h1>
            </div>
          </section>
          <section className="p-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <CalendarBoxIcon month={"MAY"} day={"23"} />
              <div className="flex flex-col">
                <span className="text-lg font-semibold">Wednesday, May 29</span>
                <span className="text-xs text-muted-foreground">
                  9:00 AM - May 31, 6:00 PM PDT
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <LocationBoxIcon />
              <div className="flex flex-col">
                <span className="text-lg font-semibold">
                  Place of Fine Arts
                </span>
                <span className="text-xs text-muted-foreground">
                  San Francisco, California
                </span>
              </div>
            </div>
          </section>
          <section className="p-4">
            <div className="p-4 rounded bg-background border">
              <p className="py-4">
                Welcome! To join the event, please register below.
              </p>
              <Button className="w-full">Register</Button>
            </div>
          </section>
          <section className="p-4">
            <SectionHeader>About Event</SectionHeader>
            <article className="prose dark:prose-invert">
              <span
                dangerouslySetInnerHTML={{
                  __html: data.body,
                }}
              />
            </article>
          </section>
          {/* <section className="p-4">
            <SectionHeader>Location</SectionHeader>
            <MapGL
              className="rounded shadow-sm min-h-96"
              initialViewState={{
                longitude: -95.652901,
                latitude: 35.645233,
              }}
            />
          </section> */}
          <section className="p-4">
            <SectionHeader>Hosted By</SectionHeader>
          </section>
        </aside>
      </div>
      <Footer />
    </main>
  );
}

function SectionHeader({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="py-4">
      <h4>{children}</h4>
      <hr className="mt-1" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="container max-w-4xl mx-auto border-t px-4 py-8 text-muted-foreground">
      <aside className="flex gap-2">
        <TwitterLogoIcon className="w-4 h-4" />
        <YoutubeIcon className="w-4 h-4" />
      </aside>
    </footer>
  );
}
