import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import React from "react";
import { CalendarBoxIcon, LocationBoxIcon } from "./icons";
import { MapGL } from "./mapgl";

const data = {
  title: "Unlocking the Future: Innovations in Technology and Sustainability",
  date: "May 23",
  description: `
<p>Join us for an exclusive virtual event, "Unlocking the Future: Innovations in Technology and Sustainability," where we bring together industry leaders, innovators, and thought leaders to explore the groundbreaking advancements shaping our world. This dynamic event will delve into the intersection of technology and sustainability, highlighting the latest trends, breakthroughs, and solutions driving us towards a more sustainable future.</p>

<h2>Event Highlights:</h2>
<ul>
  <li><strong>Keynote Speeches:</strong> Hear from renowned experts on the forefront of technological and sustainable innovations.</li>
  <li><strong>Panel Discussions:</strong> Engage with thought-provoking panels discussing real-world applications and future implications.</li>
  <li><strong>Interactive Workshops:</strong> Participate in hands-on sessions designed to foster collaboration and innovation.</li>
  <li><strong>Networking Opportunities:</strong> Connect with like-minded professionals and thought leaders from around the globe.</li>
</ul>

<h2>Featured Topics:</h2>
<ul>
  <li>The Role of Artificial Intelligence in Sustainable Development</li>
  <li>Innovations in Renewable Energy and Green Technologies</li>
  <li>Sustainable Business Practices and Circular Economy Models</li>
  <li>Future Trends in Smart Cities and Urban Development</li>
</ul>

<h2>Event Details:</h2>
<ul>
  <li><strong>Date:</strong> [Insert Date]</li>
  <li><strong>Time:</strong> [Insert Time] (with sessions available on-demand post-event)</li>
  <li><strong>Platform:</strong> [Insert Virtual Event Platform]</li>
  <li><strong>Registration:</strong> <a href="[Insert Registration Link]">Register Here</a></li>
</ul>

<p>Don't miss this opportunity to be part of the conversation that is shaping our future. Register now to secure your spot and join us in unlocking the potential of technology and sustainability.</p>

<p>For more information and to register, visit <a href="[Insert Event Website/Link]">[Insert Event Website/Link]</a>.</p>

<p>We look forward to seeing you there!</p>`,
};

export default function FormStartPage() {
  return (
    <main>
      <header className="p-4">
        <GridaLogo />
      </header>
      <div className="md:container mx-auto flex gap-0 md:gap-10 flex-col justify-center md:flex-row">
        <aside>
          <section className="mt-10">
            <Image
              className="aspect-square rounded-md overflow-hidden object-cover max-w-sm mx-auto shadow-2xl"
              width={1000}
              height={1000}
              src="/images/abstract-placeholder.jpg"
              alt=""
            />
          </section>
        </aside>
        <aside className="flex-1 md:max-w-2xl">
          <section className="p-4 mt-10">
            <div className="prose dark:prose-invert">
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
            <article className=" prose dark:prose-invert">
              <span
                dangerouslySetInnerHTML={{
                  __html: data.description,
                }}
              />
            </article>
          </section>
          <section className="p-4">
            <SectionHeader>Location</SectionHeader>
            <MapGL
              className="rounded shadow-sm min-h-96"
              initialViewState={{
                longitude: -95.652901,
                latitude: 35.645233,
              }}
            />
          </section>
          <section className="p-4">
            <SectionHeader>Hosted By</SectionHeader>
          </section>
        </aside>
      </div>
      <footer className="p-4">{/*  */}</footer>
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
