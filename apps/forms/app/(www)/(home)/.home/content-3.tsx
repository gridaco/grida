import React from "react";
import { CalendarIcon, FileTextIcon } from "@radix-ui/react-icons";
import { BellIcon, Share2Icon } from "lucide-react";
import { BentoGrid, BentoCard } from "@/www/ui/bento-grid";
import Image from "next/image";

const features = [
  {
    Icon: FileTextIcon,
    name: "React Components",
    description:
      "Use Grida as a React component, or even bring your component into our Canvas.",
    href: "#",
    cta: "Learn more",
    className: "col-span-2",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/react-components.png"
          alt=""
          width={800}
          height={400}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
    ),
  },
  {
    Icon: BellIcon,
    name: "Modular SDK",
    description: "Create your own tool. Build on top of our modular SDK.",
    href: "#",
    cta: "Learn more",
    className: "col-span-2",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/modular-sdk.png"
          alt=""
          width={800}
          height={400}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
    ),
  },
  {
    Icon: Share2Icon,
    name: "Optimized",
    description:
      "Grida is heavily optimized—our compute-intensive modules are powered by Rust and WebGPU for maximum performance.",
    href: "#",
    cta: "Learn more",
    className: "col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/optimized.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
    ),
  },
  {
    Icon: CalendarIcon,
    name: "Widgets & Templates",
    description: "??",
    href: "#",
    cta: "Learn more",
    className: "col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/widgets-templates.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
    ),
  },
  {
    Icon: CalendarIcon,
    name: "Scripting Interface",
    description:
      "Create design automations & plugins with Runtime scripting interface",
    href: "#",
    cta: "Learn more",
    className: "col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/scripting-interface.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110"
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
          <BentoCard key={idx} {...feature} />
        ))}
      </BentoGrid>
    </>
  );
}
