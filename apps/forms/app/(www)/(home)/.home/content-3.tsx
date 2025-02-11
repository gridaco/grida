import React from "react";
import {
  BentoGrid,
  BentoCard,
  BentoCardContent,
  BentoCardCTA,
} from "@/www/ui/bento-grid";
import Image from "next/image";

const features = [
  {
    name: "React Components",
    description:
      "Use Grida as a React component, or even bring your component into our Canvas.",
    className: "col-span-2",
    cta: { label: "test", href: "/" },
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/react-components.png"
          alt=""
          width={800}
          height={400}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Modular SDK",
    description: "Create your own tool. Build on top of our modular SDK.",
    className: "col-span-2",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/modular-sdk.png"
          alt=""
          width={800}
          height={400}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Optimized",
    description:
      "Grida is heavily optimized—our compute-intensive modules are powered by Rust and WebGPU for maximum performance.",
    className: "col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/optimized.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Widgets & Templates",
    description: "??",
    className: "col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/widgets-templates.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Scripting Interface",
    description:
      "Create design automations & plugins with Runtime scripting interface",
    className: "col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/scripting-interface.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
];

export default function Content3() {
  return (
    <>
      <BentoGrid className="grid-cols-4">
        {features.map((feature, idx) => (
          <BentoCard key={idx} {...feature} backgroundOrder={1}>
            <BentoCardContent
              {...feature}
              className="group-hover:-translate-y-0"
            />
          </BentoCard>
        ))}
      </BentoGrid>
    </>
  );
}
