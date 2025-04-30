"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ScratchAnimationProps {
  width?: number;
  height?: number;
  gradientColors?: string[];
  strokeWidth?: number;
  duration?: number;
  delay?: number;
  loop?: boolean;
  cursor?: boolean;
  enabled?: boolean;
}

export default function ScratchAnimation({
  width = 300,
  height = 200,
  gradientColors = ["#A97CF8", "#F38CB8", "#FDCC92"],
  strokeWidth = 44,
  duration = 1.5,
  delay = 0.5,
  loop = true,
  cursor,
  enabled = true,
}: ScratchAnimationProps) {
  const [key, setKey] = useState(0);
  const gradientId = `scratchGradient-${key}`;

  // Reset animation for looping
  useEffect(() => {
    if (!loop) return;

    const timer = setInterval(
      () => {
        setKey((prev) => prev + 1);
      },
      (duration + delay) * 1000 + 500
    );

    return () => clearInterval(timer);
  }, [duration, delay, loop]);

  // Path animation variants
  const pathVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration, ease: "easeOut" },
        opacity: { duration: 0.2 },
      },
    },
  };

  const rootVariants = {
    disabled: { opacity: 0 },
    enabled: {
      opacity: 1,
      transition: {
        duration,
        ease: "easeOut",
      },
    },
  };

  // Smooth zigzag path that looks like it was drawn on an iPad
  // const scratchPath =
  //   "M40,80 C60,40 80,120 100,60 C120,0 140,100 160,40 C180,0 200,80 220,20 C240,0 260,60 280,30";

  const scratchPath =
    "M0.224609 55.2517C122.581 13.7056 337.445 -43.7422 218.051 58.8347C68.8091 187.056 201.611 175.027 250.16 155.065C298.709 135.102 249.646 243.616 265.315 270.233";
  // Points for the cursor to follow along the zigzag path
  const xPoints = [
    40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
    200, 210, 220, 230, 240, 250, 260, 270, 280,
  ];
  const yPoints = [
    80, 60, 40, 60, 120, 90, 60, 30, 0, 50, 100, 70, 40, 20, 0, 40, 80, 50, 20,
    10, 0, 30, 60, 45, 30,
  ];

  // Generate gradient stops based on the colors array
  const generateGradientStops = () => {
    return gradientColors.map((color, index) => {
      const offset = `${(index / (gradientColors.length - 1)) * 100}%`;
      return <stop key={index} offset={offset} stopColor={color} />;
    });
  };

  // Use the first color for the cursor
  const cursorColor = gradientColors[0];

  return (
    <motion.div
      className="relative"
      style={{ width, height }}
      variants={rootVariants}
      initial="disabled"
      animate={enabled ? "enabled" : "disabled"}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 300 150"
        className="absolute top-0 left-0"
        key={key}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {generateGradientStops()}
          </linearGradient>
        </defs>

        {/* Hand cursor that follows the path */}
        {cursor && (
          <motion.g
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{
              opacity: 1,
              x: xPoints,
              y: yPoints,
            }}
            transition={{
              duration,
              times: Array.from({ length: xPoints.length }).map(
                (_, i) => i / (xPoints.length - 1)
              ),
              delay,
            }}
          >
            <circle
              r={strokeWidth * 0.7}
              fill="white"
              stroke={cursorColor}
              strokeWidth="2"
            />
          </motion.g>
        )}

        {/* The animated scribble path */}
        <motion.path
          d={scratchPath}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial="hidden"
          animate="visible"
          variants={pathVariants}
          transition={{ delay }}
        />
      </svg>
    </motion.div>
  );
}
