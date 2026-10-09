"use client";

import { useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Tabs } from "radix-ui";
import {
  Check,
  ArrowUpRight,
  ImageIcon,
  Layers3,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  BlenderLogo,
  GodotLogo,
  UnityLogo,
  UnrealEngineLogo,
} from "@grida/react-icons/logos";
import styles from "./fx-section.module.css";
import world from "@/public/www/2026-10/wind-garden-repaint/manifest.json";
import WorkflowEdgesView from "./workflow-edges-view";
import type { WorkflowEdge } from "./workflow-edges";
import MarketingPreview from "./marketing-preview";
import ProductDesignPreview from "./product-design-preview";

const workflows = {
  game: {
    label: "Game studios",
    referenceImage: world.reference,
    referenceAlt:
      "Five Wind Garden layers composed into a sunlit game landscape",
    reference: "Your layers",
    operation: "Make it loop",
    prompt: "Repaint the seams for a continuous background.",
    setting: "Preserve transparency",
    output: "Looping world",
  },
  materials: { label: "Product design" },
  campaigns: { label: "Marketing" },
} as const;

type Workflow = keyof typeof workflows;

export default function FXSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>("game");
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center start"],
  });

  return (
    <section
      ref={sectionRef}
      id="fx"
      aria-labelledby="fx-heading"
      data-theme="dark"
      data-testid="home-fx-section"
      className={`dark ${styles.section}`}
    >
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Grida FX</p>
          <h2 id="fx-heading" className={styles.heading}>
            Go with the flow.
          </h2>
        </div>

        <Tabs.Root
          value={activeWorkflow}
          onValueChange={(value) => setActiveWorkflow(value as Workflow)}
          className={styles.tabs}
        >
          <Tabs.List
            aria-label="Explore Grida FX workflows"
            className={styles.tabList}
          >
            {(Object.keys(workflows) as Workflow[]).map((key) => (
              <Tabs.Trigger key={key} value={key} className={styles.tab}>
                {workflows[key].label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className={styles.panels}>
            {(Object.keys(workflows) as Workflow[]).map((key) => (
              <Tabs.Content
                key={key}
                value={key}
                forceMount
                inert={activeWorkflow !== key}
                aria-hidden={activeWorkflow !== key}
                className={styles.panel}
              >
                {key === "campaigns" ? (
                  <MarketingPreview />
                ) : key === "materials" ? (
                  <ProductDesignPreview />
                ) : (
                  <WorkflowPreview progress={scrollYProgress} />
                )}
              </Tabs.Content>
            ))}
          </div>
        </Tabs.Root>

        <div
          className={styles.compatibility}
          data-visible={activeWorkflow === "game"}
          aria-hidden={activeWorkflow !== "game"}
        >
          <span>Works with</span>
          <div className={styles.engineLogos}>
            <BlenderLogo role="img" aria-label="Blender" />
            <UnrealEngineLogo role="img" aria-label="Unreal Engine" />
            <GodotLogo role="img" aria-label="Godot" />
            <UnityLogo role="img" aria-label="Unity" />
          </div>
        </div>
        <div className={styles.explore}>
          <Link href={sitemap.links.fx}>
            Explore Grida FX <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const gameEdges = [
  { from: "reference", to: "process" },
  { from: "process", to: "output" },
] as const satisfies readonly WorkflowEdge[];

function WorkflowPreview({ progress }: { progress: MotionValue<number> }) {
  const reducedMotion = useReducedMotion();
  const referenceY = useTransform(progress, [0.08, 0.38], [24, 0]);
  const processY = useTransform(progress, [0.14, 0.44], [42, 0]);
  const outputY = useTransform(progress, [0.2, 0.5], [60, 0]);
  const connectionProgress = useTransform(progress, [0.18, 0.48], [0, 1]);
  const item = workflows.game;

  return (
    <div
      className={styles.stage}
      aria-label={`${item.label} example: ${item.reference}, ${item.operation}, ${item.output}`}
    >
      <div className={styles.grid} aria-hidden="true" />
      <WorkflowEdgesView edges={gameEdges} progress={connectionProgress} />

      <motion.div
        data-workflow-node="reference"
        className={`${styles.node} ${styles.reference}`}
        style={{ y: reducedMotion ? 0 : referenceY }}
      >
        <div className={styles.nodeHeader}>
          <ImageIcon aria-hidden="true" />
          {item.reference}
        </div>
        <div className={styles.referenceImage}>
          <Image
            src={item.referenceImage}
            alt={item.referenceAlt}
            fill
            sizes="220px"
            draggable={false}
            className={styles.image}
          />
        </div>
        <div className={styles.nodeFooter}>
          <span className={styles.statusDot} />5 layers connected
        </div>
        <span className={`${styles.socket} ${styles.socketRight}`} />
      </motion.div>

      <motion.div
        data-workflow-node="process"
        className={`${styles.node} ${styles.process}`}
        style={{ y: reducedMotion ? 0 : processY }}
      >
        <span className={`${styles.socket} ${styles.socketLeft}`} />
        <div className={styles.nodeHeader}>
          <Sparkles aria-hidden="true" />
          {item.operation}
        </div>
        <p className={styles.prompt}>{item.prompt}</p>
        <div className={styles.setting}>
          <SlidersHorizontal aria-hidden="true" />
          <span>{item.setting}</span>
        </div>
        <div className={styles.processFooter}>
          <span>Layers → Looping background</span>
          <Check aria-hidden="true" />
        </div>
        <span className={`${styles.socket} ${styles.socketRight}`} />
      </motion.div>

      <motion.div
        data-workflow-node="output"
        className={`${styles.node} ${styles.output}`}
        style={{ y: reducedMotion ? 0 : outputY }}
      >
        <span className={`${styles.socket} ${styles.socketLeft}`} />
        <div className={styles.outputHeader}>
          <Layers3 aria-hidden="true" />
          {item.output}
        </div>
        <div className={styles.outputArt}>
          <div
            className={styles.game}
            aria-label="A seamless five-layer Wind Garden background scrolling at different depths"
          >
            {world.layers.map((layer) => (
              <div
                key={layer.id}
                className={styles.gameLayer}
                style={
                  {
                    backgroundImage: `url(${layer.file})`,
                    animationDuration: `${70 / layer.parallax}s`,
                    "--tile-width": `${(layer.width / layer.height) * 100}cqh`,
                    zIndex: layer.order,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
        <div className={styles.outputFooter}>
          <span>5 layers · Seamless repeat</span>
          <Check aria-hidden="true" />
        </div>
      </motion.div>
    </div>
  );
}
