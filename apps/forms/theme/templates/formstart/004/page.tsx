"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import {
  ScreenDecorations,
  ScreenGrid,
  ScreenGridArea,
  ScreenMobileFrame,
  ScreenRoot,
  TickerTape,
} from "@/theme/templates/kit/components";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import type { grida } from "@/grida";

const cards = [
  {
    media: {
      src: "https://images.unsplash.com/photo-1559223607-a43c990c692c?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  },
  {
    media: {
      src: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  },
  {
    media: {
      src: "https://images.unsplash.com/photo-1559223694-98ed5e272fef?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  },
];

const userprops: grida.program.template.TemplateDefinition["properties"] = {};

export default function _004() {
  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenDecorations>
          <ScreenStockTickerTape />
        </ScreenDecorations>
        <ScreenGrid rows={40} columns={16}>
          {/* <ScreenGridArea area={[1, 1, 4, 17]}>
            <StockTickerTape direction="left" />
            <StockTickerTape direction="right" />
          </ScreenGridArea> */}
          <ScreenGridArea area={[3, 1, 30, 17]}>
            <Carousel
              opts={{
                loop: true,
              }}
              plugins={[Autoplay()]}
              className="w-full h-full"
            >
              <CarouselContent className="w-full h-full ml-0 mr-0">
                {cards.map((d, i) => {
                  return (
                    <CarouselItem key={i} className="p-4 w-full aspect-[9/16]">
                      <div className="w-full h-full">
                        <Card className="w-full h-full rounded-lg overflow-hidden">
                          <Image
                            src={d.media.src}
                            alt=""
                            width={1000}
                            height={1000}
                            className="w-full h-full object-cover"
                          />
                        </Card>
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
            </Carousel>
          </ScreenGridArea>
          <ScreenGridArea area={[28, 1, 41, 17]} zIndex={1}>
            <div className="w-full h-full">
              <section className="p-4 w-full h-full border-t bg-background font-mono uppercase">
                <h1 className="text-6xl font-bold">
                  <span className="text-muted-foreground">Register 🎫 </span>
                  <br />
                  <span className="font-mono">
                    Fx <span className="text-muted-foreground">2024</span>
                  </span>
                  <br />
                  <span>
                    Right <u>👉 Now</u>
                  </span>
                  <br />
                </h1>
              </section>
            </div>
          </ScreenGridArea>
        </ScreenGrid>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

const stockItems = [
  { symbol: "AAPL", price: "150.00", trend: "up" },
  { symbol: "GOOG", price: "2800.50", trend: "down" },
  { symbol: "TSLA", price: "750.00", trend: "up" },
  { symbol: "AMZN", price: "3400.00", trend: "up" },
  { symbol: "MSFT", price: "299.00", trend: "up" },
  { symbol: "NFLX", price: "590.00", trend: "down" },
];

function StockTickerTape({
  direction,
  speed = 50,
}: {
  direction: "left" | "right" | "up" | "down";
  speed?: number;
}) {
  return (
    <TickerTape
      className="bg-foreground text-background"
      speed={speed}
      direction={direction}
    >
      {stockItems.map((item, index) => (
        <div key={index} className="px-4 font-mono text-xs font-bold">
          {item.symbol} {item.price}{" "}
          <span
            className={item.trend === "up" ? "text-green-500" : "text-red-500"}
          >
            {item.trend === "up" ? "↑" : "↓"}
          </span>
        </div>
      ))}
    </TickerTape>
  );
}

function ScreenStockTickerTape() {
  return (
    <div className="absolute inset-0">
      <div className="absolute top-0 left-0 right-0">
        <StockTickerTape direction="left" />
      </div>
      <div className="absolute bottom-0 left-0 right-0">
        <StockTickerTape direction="right" />
      </div>
    </div>
  );
}

_004.properties = userprops;
