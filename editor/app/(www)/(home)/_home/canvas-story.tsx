"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionStyle,
} from "motion/react";
import {
  ArrowRightIcon,
  MousePointer2Icon,
  HandIcon,
  FrameIcon,
  TypeIcon,
  PenToolIcon,
  PlusIcon,
  ImageIcon,
  PlayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@app/ui/components/tabs";
import styles from "./home.module.css";
import journey from "./canvas-journey.module.css";
import { CanvasWorldScene } from "./canvas-world-scene";
import world from "@/public/www/2026-10/wind-garden-repaint/manifest.json";

/** Artwork, type and tools are separate layers; scrolling moves the canvas, not a screenshot. */
export function HeroCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const artY = useTransform(scrollYProgress, [0, 1], [36, -36]);
  const noteY = useTransform(scrollYProgress, [0, 1], [72, -65]);
  const sideY = useTransform(scrollYProgress, [0, 1], [-18, 50]);
  const rotate = useTransform(scrollYProgress, [0, 1], [-3, 2]);

  return (
    <div ref={ref} className={styles.heroCanvas} data-testid="home-hero-canvas">
      <div className={styles.canvasTopline} aria-hidden="true">
        <span className={styles.projectDot} />
        <span>Untitled possibilities</span>
        <span className={styles.canvasZoom}>100%</span>
      </div>
      <div
        className={styles.heroComposition}
        role="img"
        aria-label="A canvas composition with an orange ribbon sculpture, expressive typography, color studies, and design tools"
      >
        <motion.div
          className={styles.typeStudy}
          style={{
            y: reducedMotion ? 0 : sideY,
            rotate: reducedMotion ? -5 : rotate,
          }}
        >
          <span className={styles.artboardLabel}>A thought, taking shape</span>
          <div className={styles.typeStudyInner}>
            <span className={styles.smallCaps}>A study in possibility</span>
            <p>
              What
              <br />
              if<span className={styles.typeAsterisk}>*</span>
            </p>
            <span className={styles.typeStudyFoot}>
              Leave room for a little unexpected.
            </span>
          </div>
        </motion.div>
        <motion.div
          className={styles.mainArtboard}
          style={{ y: reducedMotion ? 0 : artY }}
        >
          <span className={styles.artboardLabel}>A new perspective</span>
          <Image
            src="/www/2026-10/canvas-art.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 75vw, 660px"
            draggable={false}
            className={styles.artImage}
          />
          <div className={styles.artboardType}>
            <span>
              FORM
              <br />& FEEL.
            </span>
            <span className={styles.artboardEdition}>
              EXPLORATIONS
              <br />
              001 — ∞
            </span>
          </div>
          <div className={styles.selectionBox} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </motion.div>
        <motion.div
          className={styles.colorStudy}
          style={{ y: reducedMotion ? 0 : noteY }}
        >
          <span className={styles.artboardLabel}>Find the feeling</span>
          <div className={styles.swatches}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className={styles.colorStudyText}>
            <span>
              Warmth.
              <br />
              With a little contrast.
            </span>
            <span>↗</span>
          </div>
        </motion.div>
        <motion.div
          className={styles.canvasAnnotation}
          style={{ y: reducedMotion ? 0 : noteY }}
        >
          <span className={styles.annotationArrow}>↖</span>
          <span>Try the unexpected.</span>
        </motion.div>
      </div>
      <div className={styles.canvasToolbar} aria-hidden="true">
        <span className={styles.selectedTool}>
          <MousePointer2Icon />
        </span>
        <span>
          <HandIcon />
        </span>
        <span>
          <FrameIcon />
        </span>
        <span>
          <PenToolIcon />
        </span>
        <span>
          <TypeIcon />
        </span>
        <span className={styles.toolbarDivider} />
        <span>
          <PlusIcon />
        </span>
      </div>
    </div>
  );
}

export function CanvasStory() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState("design");
  const [inWorld, setInWorld] = useState(false);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const expansion = useTransform(scrollYProgress, [0.48, 0.7], [0, 1]);
  const background = useTransform(
    scrollYProgress,
    [0.47, 0.6],
    ["#fafafa", "#111111"]
  );
  const copyOpacity = useTransform(scrollYProgress, [0.4, 0.48], [1, 0]);
  const chromeOpacity = useTransform(scrollYProgress, [0.4, 0.48], [1, 0]);
  const worldOpacity = useTransform(scrollYProgress, [0.67, 0.76], [0, 1]);
  const designProgress = useTransform(scrollYProgress, [0, 0.16], [0, 1]);
  const presentProgress = useTransform(scrollYProgress, [0.16, 0.32], [0, 1]);
  const generateProgress = useTransform(scrollYProgress, [0.32, 0.46], [0, 1]);

  // Discrete crossings change UI state; motion values do all per-frame work.
  // Manual tab choices persist within each phase.
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reducedMotion || window.matchMedia("(max-width: 700px)").matches)
      return;
    const previous = scrollYProgress.getPrevious() ?? 0;
    const phase = value >= 0.48 ? 3 : value >= 0.32 ? 2 : value >= 0.16 ? 1 : 0;
    const previousPhase =
      previous >= 0.48 ? 3 : previous >= 0.32 ? 2 : previous >= 0.16 ? 1 : 0;
    if (phase !== previousPhase) {
      setActive(phase === 0 ? "design" : phase === 1 ? "present" : "generate");
      setInWorld(phase === 3);
    }
  });

  return (
    <section
      ref={ref}
      id="canvas"
      aria-labelledby="canvas-heading"
      className={journey.track}
      data-testid="home-canvas-journey"
    >
      <motion.div
        className={journey.stage}
        style={{ backgroundColor: reducedMotion ? "#fafafa" : background }}
      >
        <Tabs
          value={active}
          onValueChange={setActive}
          orientation="vertical"
          className={journey.tabs}
        >
          <motion.div
            className={journey.copy}
            style={{ opacity: reducedMotion ? 1 : copyOpacity }}
            inert={!reducedMotion && inWorld}
            aria-hidden={!reducedMotion && inWorld}
          >
            <h2 id="canvas-heading">
              Follow
              <br />
              an idea.
            </h2>
            <TabsList
              aria-label="Explore the canvas"
              className={styles.storyTabs}
            >
              {[
                {
                  id: "design",
                  label: "Design",
                  copy: "Make room to explore, arrange, and design.",
                  href: "/index/canvas",
                  link: "Explore the canvas",
                },
                {
                  id: "present",
                  label: "Present",
                  copy: "Turn your work into slides worth sharing.",
                  href: "/slides",
                  link: "Explore slides",
                },
                {
                  id: "generate",
                  label: "Automate",
                  copy: "Connect models and steps to create something new.",
                  href: "/fx",
                  link: "Explore Grida FX",
                },
              ].map((item) => (
                <div key={item.id} className={styles.storyTabItem}>
                  <TabsTrigger value={item.id} className={styles.storyTab}>
                    {item.label}
                  </TabsTrigger>
                  <motion.div
                    initial={false}
                    animate={{
                      height: active === item.id ? "auto" : 0,
                      opacity: active === item.id ? 1 : 0,
                    }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.35,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={styles.storyDescriptionReveal}
                    inert={active !== item.id}
                    aria-hidden={active !== item.id}
                  >
                    <div className={styles.storyDescription}>
                      <p>{item.copy}</p>
                      <Link href={item.href}>
                        {item.link} <ArrowRightIcon />
                      </Link>
                    </div>
                  </motion.div>
                </div>
              ))}
            </TabsList>
          </motion.div>

          <motion.div
            className={journey.frame}
            style={
              {
                "--world-open": reducedMotion ? 0 : expansion,
              } as MotionStyle
            }
          >
            <motion.div
              className={journey.windowSurface}
              style={{ opacity: reducedMotion ? 1 : chromeOpacity }}
              aria-hidden="true"
            />
            <TabsContent
              value="design"
              className={journey.designPanel}
              tabIndex={!reducedMotion && inWorld ? -1 : 0}
            >
              <DesignPreview />
            </TabsContent>
            <TabsContent
              value="present"
              className={journey.designPanel}
              tabIndex={!reducedMotion && inWorld ? -1 : 0}
            >
              <PresentPreview />
            </TabsContent>
            <TabsContent
              value="generate"
              forceMount
              className={journey.generatePanel}
              tabIndex={!reducedMotion && inWorld ? -1 : 0}
            >
              <motion.div
                className={journey.windowChrome}
                style={{ opacity: reducedMotion ? 1 : chromeOpacity }}
                aria-hidden="true"
              >
                <span className={journey.previewProject}>Scene generator</span>
                <span className={journey.fxMark}>f(x)</span>
              </motion.div>
              <div className={journey.worldArtwork}>
                <CanvasWorldArtwork />
                <motion.div
                  className={journey.worldShade}
                  style={{ opacity: reducedMotion ? 0 : worldOpacity }}
                  aria-hidden="true"
                />
              </div>
              <motion.div
                className={journey.workflowSteps}
                style={{ opacity: reducedMotion ? 1 : chromeOpacity }}
                aria-hidden="true"
              >
                <svg
                  className={journey.workflowWires}
                  viewBox="0 0 1000 800"
                  preserveAspectRatio="none"
                >
                  <path d="M 195 342 C 195 420 195 420 195 474" />
                  <path d="M 328 540 C 370 540 330 400 395 400" />
                  <circle cx="195" cy="342" r="4" />
                  <circle cx="195" cy="474" r="4" />
                  <circle cx="328" cy="540" r="4" />
                  <circle cx="395" cy="400" r="4" />
                </svg>
                <div className={journey.promptNode}>
                  <div className={journey.nodeHeading}>
                    <TypeIcon /> <span>Describe a world</span>
                  </div>
                  <p>
                    Chalk terraces.
                    <br />
                    Pale fan trees.
                    <br />
                    Room to wander.
                  </p>
                </div>
                <div className={journey.modelNode}>
                  <div className={journey.nodeHeading}>
                    <SparklesIcon /> <span>Generate layers</span>
                  </div>
                  <div className={journey.nodeSettings}>
                    <span>Landscape</span>
                    <span>16:9</span>
                  </div>
                </div>
                <div className={journey.workflowFoot}>
                  <span>One idea. A world of possibilities.</span>
                  <span>
                    Grida FX <ArrowRightIcon />
                  </span>
                </div>
              </motion.div>
            </TabsContent>
            <motion.div
              className={journey.progress}
              style={{ opacity: reducedMotion ? 1 : chromeOpacity }}
              aria-hidden="true"
            >
              {[designProgress, presentProgress, generateProgress].map(
                (progress, index) => (
                  <span key={index}>
                    <motion.span
                      style={{ scaleX: reducedMotion ? 1 : progress }}
                    />
                  </span>
                )
              )}
            </motion.div>
          </motion.div>
        </Tabs>
        <motion.div
          className={journey.worldTitle}
          style={{ opacity: reducedMotion ? 0 : worldOpacity }}
          aria-hidden={reducedMotion || !inWorld}
        >
          <span>GRIDA FX</span>
          <h2>Worlds start here.</h2>
        </motion.div>
      </motion.div>
      <div className={journey.staticWorld}>
        <WorldArtwork />
        <div>
          <span>GRIDA FX</span>
          <h2>Worlds start here.</h2>
        </div>
      </div>
    </section>
  );
}

/** Thin lifecycle wire: the scene owns scroll composition and playback. */
function CanvasWorldArtwork() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = new CanvasWorldScene(ref.current!);
    return () => scene.dispose();
  }, []);

  return (
    <div
      ref={ref}
      className={journey.worldImage}
      role="img"
      aria-label="Separate sky, hills, trees, terrain, and foreground layers assemble into a continuously scrolling game landscape"
    >
      {world.layers.map((layer) => (
        <div
          key={layer.id}
          className={journey.worldLayer}
          data-canvas-world-layer={layer.id}
          data-tile-ratio={layer.width / layer.height}
          data-parallax={layer.parallax}
          aria-hidden="true"
          style={
            {
              "--content-top": layer.content_bounds.y / layer.height,
              "--content-bottom":
                1 -
                (layer.content_bounds.y + layer.content_bounds.height) /
                  layer.height,
              "--content-left": layer.content_bounds.x / layer.width,
              "--content-right":
                1 -
                (layer.content_bounds.x + layer.content_bounds.width) /
                  layer.width,
              backgroundImage: `url(${layer.file})`,
              zIndex: layer.order,
            } as CSSProperties
          }
        >
          <div className={journey.layerSelection}>
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The workflow output persists into the full-screen world. */
function WorldArtwork({ sizes = "100vw" }: { sizes?: string }) {
  return (
    <Image
      src={world.preview}
      alt="A sunlit game world with pale fan trees, grassy chalk terraces, and distant hills"
      fill
      sizes={sizes}
      loading="lazy"
      draggable={false}
      className={journey.landscape}
    />
  );
}

function DesignPreview() {
  return (
    <div
      className={journey.designPreview}
      role="img"
      aria-label="A design canvas with an expressive ribbon poster, an editable typographic composition, and color swatches"
    >
      <div className={journey.previewHeader} aria-hidden="true">
        <span className={journey.previewProject}>
          Form study <span>/</span> Exploration 01
        </span>
        <span>Canvas</span>
      </div>
      <div className={journey.typeSpecimen} aria-hidden="true">
        <small>TYPE EXPLORATION</small>
        <strong>Aa</strong>
        <span>
          Good things
          <br />
          take shape.
        </span>
        <div className={journey.typeRule} />
        <small>
          Regular <span>48</span>
        </small>
      </div>
      <div className={journey.poster} aria-hidden="true">
        <Image
          src="/www/2026-10/canvas-art.webp"
          alt=""
          fill
          sizes="500px"
          draggable={false}
          className={journey.landscape}
        />
        <div className={journey.posterEdition}>
          <span>STUDIO EXPLORATIONS</span>
          <span>01 / 26</span>
        </div>
        <div className={journey.posterTitle}>
          In good
          <br />
          <em>form.</em>
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className={journey.posterFooter}>
          <span>
            A little room
            <br />
            for the unexpected.
          </span>
          <span>↗</span>
        </div>
      </div>
      <div className={journey.colorPalette} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className={journey.designToolbar} aria-hidden="true">
        <span>
          <MousePointer2Icon />
        </span>
        <FrameIcon />
        <PenToolIcon />
        <TypeIcon />
        <ImageIcon />
      </div>
    </div>
  );
}

function PresentPreview() {
  return (
    <div
      className={journey.presentPreview}
      role="img"
      aria-label="An editorial presentation about everyday objects, with a glass bottle photograph and three slide thumbnails"
    >
      <div className={journey.previewHeader} aria-hidden="true">
        <span className={journey.previewProject}>
          Still <span>/</span> Brand direction
        </span>
        <span>
          <PlayIcon /> Present
        </span>
      </div>
      <div className={journey.presentationSlide} aria-hidden="true">
        <div className={journey.slideEditorial}>
          <small>STILL — OBJECTS FOR EVERYDAY</small>
          <strong>
            Less,
            <br />
            but better.
          </strong>
          <span>A quieter way to live.</span>
          <small>
            BRAND DIRECTION <span>01</span>
          </small>
        </div>
        <div className={journey.slidePhotograph}>
          <Image
            src="/www/2026-10/models-glass.webp"
            alt=""
            fill
            sizes="420px"
            draggable={false}
            className={journey.landscape}
          />
        </div>
      </div>
      <div className={journey.presentationStrip} aria-hidden="true">
        <div className={journey.thumbnailSelected}>
          <strong>
            Less,
            <br />
            but better.
          </strong>
          <span />
        </div>
        <div className={journey.thumbnailType}>
          <small>THE IDEA</small>
          <strong>
            Space
            <br />
            to breathe.
          </strong>
        </div>
        <div className={journey.thumbnailPalette}>
          <i />
          <i />
          <i />
          <span>Material matters.</span>
        </div>
      </div>
      <div className={journey.slidePagination} aria-hidden="true">
        <ChevronLeftIcon />
        <span>1 / 3</span>
        <ChevronRightIcon />
      </div>
    </div>
  );
}
