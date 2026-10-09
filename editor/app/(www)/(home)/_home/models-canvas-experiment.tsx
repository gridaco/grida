"use client";

// CLEANUP IF DEADCODE: retained moving-canvas experiment for a possible workflow explainer.
// Not mounted on the homepage. Remove with its stylesheet if it is not picked up.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  cubicBezier,
  useSpring,
  useReducedMotion,
  useMotionValueEvent,
  type MotionValue,
  useScroll,
  useTransform,
} from "motion/react";
import { ArrowUpRight } from "lucide-react";
import {
  BlackForestLabsLogo,
  ByteDanceLogo,
  GoogleLogo,
  OpenAILogo,
} from "@grida/react-icons/logos";
import styles from "./models-canvas-experiment.module.css";

// These illustrations establish the visual direction; they are not outputs
// from the named models.
const models = [
  {
    name: "Veo 3.1",
    placement: { x: -710, y: -410, width: 760, height: 428 },
    lab: "Google",
    Logo: GoogleLogo,
    image: "/www/grida-model-video-landscape-placeholder.webp",
    alt: "A lone runner crossing sculptural sand dunes at dusk",
  },
  {
    name: "GPT Image 2.5 Flare",
    placement: { x: 170, y: -380, width: 300, height: 390 },
    lab: "OpenAI",
    Logo: OpenAILogo,
    image: "/www/grida-model-image-still-life-placeholder.webp",
    alt: "Oranges and a cobalt glass vase in afternoon sunlight",
  },
  {
    name: "Flux 2 Pro",
    placement: { x: -420, y: 110, width: 460, height: 260 },
    lab: "Black Forest Labs",
    Logo: BlackForestLabsLogo,
    image: "/www/grida-model-image-sculpture-placeholder.webp",
    alt: "A folded chrome sculpture reflecting light against a blue backdrop",
  },
  {
    name: "Seedance 2.0",
    placement: { x: 140, y: 110, width: 600, height: 338 },
    lab: "ByteDance",
    Logo: ByteDanceLogo,
    image: "/www/grida-model-video-city-placeholder.webp",
    alt: "A cyclist moving through a rain-soaked city street at night",
  },
] as const;

// Each stop has a short hold; the final leg reveals the complete composition.
// Ordinary page scrolling drives this camera.
const stops = [0, 0.08, 0.26, 0.33, 0.5, 0.57, 0.74, 0.81, 1];
const travelEase = cubicBezier(0.4, 0, 0.2, 1);
const verticalEase = cubicBezier(0.3, 0, 0.3, 1);

export default function ModelsCanvasExperiment() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const [atOverview, setAtOverview] = useState(false);
  const staticView = reducedMotion || viewport.width <= 900;
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    mass: 0.6,
    restDelta: 0.0001,
    restSpeed: 0.0001,
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const focuses = models.map(({ placement: p }) => {
    const scale = Math.min(
      (viewport.width * 0.68) / p.width,
      (viewport.height * 0.62) / p.height
    );
    return {
      scale,
      x: -(p.x + p.width / 2) * scale,
      y: -(p.y + p.height / 2) * scale,
    };
  });
  const overviewScale = Math.min(
    (viewport.width - 160) / 1450,
    (viewport.height - 280) / 910
  );
  const x = useTransform(
    progress,
    stops,
    [
      focuses[0].x,
      focuses[0].x,
      focuses[1].x,
      focuses[1].x,
      focuses[2].x,
      focuses[2].x,
      focuses[3].x,
      focuses[3].x,
      -15 * overviewScale,
    ],
    { ease: travelEase }
  );
  const y = useTransform(
    progress,
    stops,
    [
      focuses[0].y,
      focuses[0].y,
      focuses[1].y,
      focuses[1].y,
      focuses[2].y,
      focuses[2].y,
      focuses[3].y,
      focuses[3].y,
      -40 * overviewScale,
    ],
    { ease: verticalEase }
  );
  const scale = useTransform(
    progress,
    stops,
    [
      focuses[0].scale,
      focuses[0].scale,
      focuses[1].scale,
      focuses[1].scale,
      focuses[2].scale,
      focuses[2].scale,
      focuses[3].scale,
      focuses[3].scale,
      overviewScale,
    ],
    { ease: travelEase }
  );
  const linkOpacity = useTransform(progress, [0.88, 0.97], [0, 1]);
  const captionScale = useTransform(scale, (value) => 1 / value);

  useMotionValueEvent(progress, "change", (progress) => {
    const overview = progress >= 0.92;
    setAtOverview((previous) => (previous === overview ? previous : overview));
  });

  return (
    <section
      ref={sectionRef}
      id="models"
      aria-labelledby="models-heading"
      className={styles.section}
      data-testid="home-models-canvas-experiment"
    >
      <div ref={stageRef} className={styles.stage}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Models</p>
          <h2 id="models-heading" className={styles.heading}>
            More ways to create.
          </h2>
        </div>

        <div className={styles.viewport}>
          <motion.div
            className={styles.canvas}
            style={staticView ? undefined : { x, y, scale }}
          >
            {models.map((model, index) => (
              <ModelExhibit
                key={model.name}
                model={model}
                index={index}
                progress={progress}
                captionScale={captionScale}
                staticView={!!staticView}
              />
            ))}
          </motion.div>
        </div>

        <motion.div
          className={styles.afterword}
          style={{ opacity: staticView ? 1 : linkOpacity }}
          inert={!staticView && !atOverview}
        >
          <Link href="/ai/models" className={styles.link}>
            Explore all models
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function ModelExhibit({
  model,
  index,
  progress,
  captionScale,
  staticView,
}: {
  model: (typeof models)[number];
  index: number;
  progress: MotionValue<number>;
  captionScale: MotionValue<number>;
  staticView: boolean;
}) {
  const { name, lab, Logo, image, alt, placement } = model;
  const opacity = useTransform(
    progress,
    stops,
    [0, 0, 1, 1, 2, 2, 3, 3, -1].map((focus) =>
      focus === index || focus === -1 ? 1 : 0.32
    )
  );
  return (
    <motion.figure
      className={styles.exhibit}
      style={{
        left: placement.x,
        top: placement.y,
        width: placement.width,
        opacity: staticView ? 1 : opacity,
      }}
    >
      <div className={styles.artwork} style={{ height: placement.height }}>
        <Image
          src={image}
          alt={alt}
          fill
          sizes="(max-width: 900px) 80vw, 1100px"
          draggable={false}
          className={styles.image}
        />
      </div>
      <motion.figcaption
        className={styles.caption}
        style={{ scale: staticView ? 1 : captionScale }}
      >
        <span role="img" aria-label={lab} className={styles.logo}>
          <Logo />
        </span>
        <h3 className={styles.modelName}>{name}</h3>
      </motion.figcaption>
    </motion.figure>
  );
}
