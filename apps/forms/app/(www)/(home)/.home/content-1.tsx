"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import * as k from "./data";

export default function Content1() {
  const tabsRef = useRef<(HTMLElement | null)[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0); // Default active tab index
  const [tabUnderlineWidth, setTabUnderlineWidth] = useState(0);
  const [tabUnderlineLeft, setTabUnderlineLeft] = useState(0);

  useEffect(() => {
    const setTabPosition = () => {
      const currentTab = tabsRef.current[activeTabIndex] as HTMLElement;
      setTabUnderlineLeft(currentTab?.offsetLeft ?? 0);
      setTabUnderlineWidth(currentTab?.clientWidth ?? 0);
    };

    setTabPosition();
  }, [activeTabIndex]);

  return (
    <div className="flex flex-col items-center justify-center my-16 gap-10">
      {/* Tabs List with Sliding Underline */}
      <div className="relative flex flex-wrap bg-transparent h-9 items-center content-center gap-3 justify-center text-slate-400">
        <span
          className="absolute bottom-0 top-0 -z-10 flex overflow-hidden rounded-full transition-all duration-300"
          style={{
            left: tabUnderlineLeft,
            width: tabUnderlineWidth,
          }}
        >
          <span className="h-full w-full rounded-full bg-black" />
        </span>

        {/* Tabs */}
        {k.demo_1_categories.map((category, index) => (
          <button
            key={category}
            ref={(el) => (tabsRef.current[index] = el)}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1 text-lg font-normal transition-all ${
              activeTabIndex === index
                ? "bg-black text-white dark:invert"
                : "hover:text-slate-300"
            }`}
            onClick={() => setActiveTabIndex(index)}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div className="container md:h-[776px] w-full overflow-hidden">
        <motion.img
          className="w-full h-full object-cover"
          src={
            k.imagesDemo1[
              k.demo_1_categories[activeTabIndex] as keyof typeof k.imagesDemo1
            ]
          }
          alt={k.demo_1_categories[activeTabIndex]}
          width={1400}
          height={776}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        />
      </div>
    </div>
  );
}
