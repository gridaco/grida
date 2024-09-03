"use client";
import React from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/www/footer";
import Header from "@/www/header";
import Autoplay from "embla-carousel-autoplay";
import grida_database_artwork from "../../public/images/abstract-database-illustration.png";
import { GridaLogo } from "@/components/grida-logo";
import { TheBundleLogo } from "@/components/logos/the-bundle";

interface FeaturedData {
  name: "grida_forms" | "grida_database" | "the_bundle";
}

const data: FeaturedData[] = [
  {
    name: "grida_database",
  },
  {
    name: "grida_forms",
  },
  {
    name: "the_bundle",
  },
];

const components = {
  grida_forms: GridaFormsCard,
  grida_database: GridaDatabaseCard,
  the_bundle: TheBundleCard,
};

export default function Home() {
  return (
    <main>
      <Background />
      <Header />
      <div className="mt-60 mb-20 container mx-auto text-center flex items-center justify-center">
        <h1 className="text-6xl font-black max-w-xl">Meet Grida</h1>
      </div>
      <div className="w-full flex items-center justify-center">
        <div className="w-full">
          <Carousel
            className="w-full"
            opts={{ loop: true }}
            plugins={[
              Autoplay({
                delay: 4000,
              }),
            ]}
          >
            <CarouselContent className="overflow-visible">
              {data.map(({ name }, index) => (
                <CarouselItem key={index}>
                  <div className="p-10">
                    <Card className="max-w-screen-2xl mx-auto p-0 bg-transparent overflow-hidden rounded-3xl">
                      <div className="flex aspect-video p-0">
                        {React.createElement(components[name])}
                      </div>
                    </Card>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </div>
      <Footer />
    </main>
  );
}
function Background() {
  return (
    <iframe
      src="https://bg.grida.co/embed/dots"
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none"
    />
  );
}

function GridaDatabaseCard() {
  return (
    <div className="w-full relative">
      <iframe
        src="https://bg.grida.co/embed/shadergradient/88"
        className="absolute inset-0 w-full h-full -z-10 pointer-events-none border-none"
      />
      {/* <Image
        src={grida_database_artwork}
        alt="Grida Database"
        placeholder="blur"
        className="w-full h-full"
      /> */}
      <div className="p-4 w-full h-full flex items-center justify-center">
        <h1 className="text-5xl font-black flex items-center">
          <GridaLogo className=" inline-flex w-10 h-10 align-middle me-4" />{" "}
          Database
        </h1>
      </div>
    </div>
  );
}

function GridaFormsCard() {
  return (
    <div className="w-full relative">
      <iframe
        src="https://bg.grida.co/embed/shadergradient/95"
        className="absolute inset-0 w-full h-full -z-10 pointer-events-none border-none"
      />
      {/* <Image
        src={grida_database_artwork}
        alt="Grida Database"
        placeholder="blur"
        className="w-full h-full"
      /> */}
      <div className="p-4 w-full h-full flex items-center justify-center">
        <h1 className="text-5xl font-black flex items-center">
          <GridaLogo className=" inline-flex w-10 h-10 align-middle me-4" />{" "}
          Forms
        </h1>
      </div>
    </div>
  );
}

function TheBundleCard() {
  return (
    <div className="w-full relative">
      <video
        src="https://player.vimeo.com/progressive_redirect/playback/860123788/rendition/1080p/file.mp4?loc=external&log_user=0&signature=ac9c2e0d2e367d8a31af6490edad8c1f7bae87d085c4f3909773a7ca5a129cb6"
        className="absolute inset-0 w-full h-full -z-10 pointer-events-none border-none object-cover"
        muted
        loop
        autoPlay
        playsInline
      />
      <div className="p-4 w-full h-full flex items-center justify-center">
        <h1 className="text-5xl font-black flex items-center text-white fill-white">
          <TheBundleLogo className="h-16 w-auto" />
        </h1>
      </div>
    </div>
  );
}
