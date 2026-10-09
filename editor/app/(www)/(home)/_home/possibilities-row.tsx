"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Terminal,
  KeyRound,
  FileText,
  Table2,
  ShieldCheck,
  LibraryBig,
} from "lucide-react";
import {
  OpenAILogo,
  ClaudeLogo,
  CodexLogo,
  OllamaLogo,
} from "@grida/react-icons/logos";
import styles from "./possibilities-row.module.css";
import slideCharacterArtwork from "@/app/(canvas)/svg/_fixtures/artwork";
import { svgToDataUri } from "@/app/(canvas)/svg/_storage/thumbnails";
import { sitemap } from "@/www/data/sitemap";

const defaultSlideArtwork = svgToDataUri(slideCharacterArtwork);

// Pinned public objects from the Library's home collection. Bundled thumbnails
// keep homepage rendering independent of Library queries and storage requests.
const libraryPreviewObjects = [
  { id: "039aff90-7dcd-4827-8452-ce9160b1a3b7", height: 160 },
  { id: "0494d2a4-7405-405a-9173-b50a622811a4", height: 126 },
  { id: "037c9996-307c-40d0-ada8-5887f9017119", height: 180 },
  { id: "0479d634-ac0d-4c25-b4bb-165f7a704a10", height: 110 },
] as const;

const topics = [
  {
    id: "agent",
    title: "Your agent",
    copy: "Claude Code, Codex, or your own scripts. Use Grida CLI to create assets and save them straight into your project.",
    href: "/docs/cli",
    link: "Explore the CLI",
  },
  {
    id: "chatgpt",
    title: "Connect ChatGPT",
    copy: "Connect your ChatGPT subscription to Grida Desktop and use supported text models with your plan’s limits. Use separate providers for images and video.",
    href: "/docs/editor/desktop/chatgpt-subscription",
    link: "Connect ChatGPT",
  },
  {
    id: "library",
    title: "Library",
    copy: "Great references are already built in. Explore free examples and templates, find a direction, and make it your own.",
    href: sitemap.links.library,
    link: "Explore the Library",
  },
  {
    id: "zdr",
    title: "Zero data retention",
    copy: "Use cloud models with a supported provider’s zero data retention policy. Coverage applies to eligible model requests.",
    href: "https://openrouter.ai/docs/guides/features/zdr",
    link: "About zero data retention",
  },
  {
    id: "keys",
    title: "Bring your own key",
    copy: "Use Grida AI Gateway with Grida credits, or bring your own key and pay your provider directly.",
    href: sitemap.links.ai_gateway,
    link: "Explore AI Gateway",
  },
  {
    id: "local",
    title: "Local models",
    copy: "Run supported text models on your computer with Ollama. Those model requests stay on your machine.",
    href: "/docs/editor/desktop/local-models",
    link: "Set up Ollama",
  },
  {
    id: "forms",
    title: "Forms",
    copy: "Design a form, share it, and collect responses. Give the questions the same care as the rest of your work.",
    href: "/forms",
    link: "Explore Forms",
  },
  {
    id: "database",
    title: "Database",
    copy: "Bring your records into view. Organize data and work with the details behind your projects.",
    href: "/database",
    link: "Explore Database",
  },
  {
    id: "slides",
    title: "Slides",
    copy: "Turn ideas into a story worth sharing. Make slides with the freedom of an open canvas.",
    href: "/slides",
    link: "Explore Slides",
  },
] as const;

/** An ordinary browsing row, independent of the page's scroll story. */
export default function PossibilitiesRow() {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const move = (direction: number) => {
    const element = row.current;
    if (!element) return;
    const item = element.querySelector("article");
    element.scrollBy({
      left: direction * ((item?.getBoundingClientRect().width ?? 360) + 24),
    });
  };
  return (
    <section
      className={styles.section}
      aria-labelledby="possibilities-heading"
      data-testid="home-possibilities-row"
    >
      <div className={styles.heading}>
        <h3 id="possibilities-heading">Make it your own.</h3>
        <div className={styles.controls}>
          <button
            type="button"
            aria-label="Previous topics"
            disabled={edges.start}
            onClick={() => move(-1)}
          >
            <ArrowLeft />
          </button>
          <button
            type="button"
            aria-label="Next topics"
            disabled={edges.end}
            onClick={() => move(1)}
          >
            <ArrowRight />
          </button>
        </div>
      </div>
      <div
        ref={row}
        className={styles.row}
        tabIndex={0}
        role="region"
        aria-label="Tools and ways to work"
        onScroll={(event) => {
          const element = event.currentTarget;
          const start = element.scrollLeft < 2;
          const end =
            element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
          setEdges((current) =>
            current.start === start && current.end === end
              ? current
              : { start, end }
          );
        }}
      >
        {topics.map((topic) => (
          <article key={topic.id} className={styles.topic}>
            <h4>{topic.title}</h4>
            <p>{topic.copy}</p>
            <Link href={topic.href}>
              {topic.link}
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <div className={styles.visual} aria-hidden="true">
              <TopicVisual topic={topic.id} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TopicVisual({ topic }: { topic: (typeof topics)[number]["id"] }) {
  switch (topic) {
    case "agent":
      return (
        <div className={`${styles.window} ${styles.terminal}`}>
          <div className={styles.agentLogos}>
            <span>
              <CodexLogo /> Codex
            </span>
            <span>
              <ClaudeLogo /> Claude Code
            </span>
          </div>
          <div className={styles.chrome}>
            <Terminal size={14} /> Studio / assets
          </div>
          <p>
            <span>❯</span> grida
          </p>
          <p className={styles.dim}>Create a new direction.</p>
          <div className={styles.asset}>
            <Image
              src="/www/2026-10/canvas-art.webp"
              alt=""
              fill
              sizes="300px"
              draggable={false}
            />
          </div>
          <small>exploration.png</small>
        </div>
      );
    case "keys":
      return (
        <div className={styles.window}>
          <div className={styles.chrome}>
            <KeyRound size={15} /> Grida AI Gateway
          </div>
          {["OpenAI", "Anthropic", "Google"].map((name) => (
            <div className={styles.provider} key={name}>
              <span>{name}</span>
              <span>Grida credits</span>
            </div>
          ))}
          <div className={styles.smallNote}>
            One balance. Bring your own key, if you prefer.
          </div>
        </div>
      );
    case "chatgpt":
      return (
        <div className={`${styles.window} ${styles.chatgpt}`}>
          <OpenAILogo className={styles.openai} />
          <strong>Bring your ChatGPT plan.</strong>
          <p>Keep the subscription you already use.</p>
          <span className={styles.connect}>
            Connect ChatGPT <ArrowUpRight size={14} />
          </span>
          <small>Experimental · Supported text models</small>
        </div>
      );
    case "local":
      return (
        <div className={`${styles.window} ${styles.chatgpt}`}>
          <OllamaLogo className={styles.openai} />
          <strong>On your computer.</strong>
          <p>Your text model runs locally.</p>
          <div className={styles.localRequest}>
            <span>Your workspace</span>
            <ArrowRight size={16} />
            <span>Ollama</span>
          </div>
          <small>Local text models</small>
        </div>
      );
    case "zdr":
      return (
        <div className={`${styles.window} ${styles.chatgpt}`}>
          <ShieldCheck className={styles.openai} strokeWidth={1.4} />
          <strong>Choose how requests are handled.</strong>
          <p>Zero data retention through supported providers.</p>
          <div className={styles.retention}>
            <span>Eligible requests</span>
            <span>Zero data retention</span>
          </div>
          <small>Your provider’s policy applies.</small>
        </div>
      );
    case "library":
      return (
        <div className={`${styles.window} ${styles.library}`}>
          <div className={styles.chrome}>
            <LibraryBig size={15} /> Grida Library
            <span className={styles.libraryFree}>Free to use</span>
          </div>
          <div className={styles.libraryCollection}>
            {libraryPreviewObjects.map((object) => (
              <div
                key={object.id}
                data-library-object={object.id}
                style={{ height: object.height }}
              >
                <Image
                  src={`/www/2026-10/library/${object.id}.webp`}
                  alt=""
                  fill
                  sizes="170px"
                  loading="lazy"
                  draggable={false}
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      );
    case "forms":
      return (
        <div className={styles.window}>
          <div className={styles.chrome}>
            <FileText size={15} /> Studio visit
          </div>
          <strong className={styles.formTitle}>Let’s meet.</strong>
          <div className={styles.field}>Your name</div>
          <div className={styles.field}>Email address</div>
          <div className={styles.field}>What are you working on?</div>
          <span className={styles.submit}>
            Send response <ArrowRight size={14} />
          </span>
        </div>
      );
    case "database":
      return (
        <div className={`${styles.window} ${styles.database}`}>
          <div className={styles.chrome}>
            <Table2 size={15} /> Studio projects
          </div>
          <div className={styles.table}>
            <div>Project</div>
            <div>Status</div>
            <div>Owner</div>
            {[
              ["Elsewhere", "In progress", "Sam"],
              ["Studio studies", "Review", "Alex"],
              ["Spring campaign", "Draft", "Lee"],
              ["Launch deck", "Ready", "Sam"],
            ].flatMap((cells, i) =>
              cells.map((cell, j) => <span key={`${i}-${j}`}>{cell}</span>)
            )}
          </div>
        </div>
      );
    case "slides":
      return (
        <div className={styles.slideIllustration}>
          <Image
            src={defaultSlideArtwork}
            alt=""
            width={200}
            height={205.5}
            unoptimized
            draggable={false}
            className="h-full w-full select-none object-contain"
          />
        </div>
      );
  }
}
