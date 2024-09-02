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

interface FeaturedData {
  name: "grida_forms" | "grida_database" | "the_bundle";
}

const data: FeaturedData[] = [
  {
    name: "grida_database",
  },
  {
    name: "grida_database",
  },
];

const components = {
  grida_forms: GridaDatabaseCard,
  grida_database: GridaDatabaseCard,
  the_bundle: GridaDatabaseCard,
};

export default function Home() {
  return (
    <main>
      {/* <Background /> */}
      <Header />
      <div className="mt-80 mb-20 container mx-auto text-center flex items-center justify-center">
        <h1 className="text-6xl font-black max-w-xl">
          No-Code Techs for Developers
        </h1>
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
