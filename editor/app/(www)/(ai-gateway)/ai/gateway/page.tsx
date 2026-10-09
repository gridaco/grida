// GRIDA-GG: gateway — standalone product overview.
import type { Metadata } from "next";
import Link from "next/link";
import { AppWindow, ArrowRight, ArrowUpRight, KeyRound } from "lucide-react";
import {
  OpenAILogo,
  ByteDanceLogo,
  GoogleLogo,
  BlackForestLabsLogo,
  TripoLogo,
} from "@grida/react-icons/logos";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { sitemap } from "@/www/data/sitemap";
import styles from "./page.module.css";

const title = "AI Gateway — Grida";
const description =
  "Generate images, video, audio, and 3D assets with Grida AI Gateway. One API for creative models, generation jobs, credits, and usage.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://grida.co"),
  alternates: { canonical: "https://grida.co/ai/gateway" },
  openGraph: {
    title,
    description,
    url: "https://grida.co/ai/gateway",
    type: "website",
  },
  twitter: { card: "summary" },
};

const providers = [
  { name: "OpenAI", Logo: OpenAILogo },
  { name: "ByteDance", Logo: ByteDanceLogo },
  { name: "Google", Logo: GoogleLogo },
  { name: "Black Forest Labs", Logo: BlackForestLabsLogo },
  { name: "Tripo", Logo: TripoLogo },
];

const capabilities = [
  {
    title: "Built for creation",
    copy: "Generate and edit images, create video and audio, and build 3D assets from prompts or references.",
  },
  {
    title: "From request to result",
    copy: "Submit generation jobs, track their progress, and collect the output when it’s ready.",
  },
  {
    title: "Credits or your keys",
    copy: "Start with Grida credits, or bring your own provider keys and use your existing accounts.",
  },
  {
    title: "Usage under control",
    copy: "See requests, costs, and latency. Set budgets and limits for your projects and API keys.",
  },
];

export default function AIGatewayPage() {
  return (
    <div className={styles.page} data-testid="ai-gateway-page">
      <Header />
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="gateway-title">
          <div className={styles.intro}>
            <p className={styles.eyebrow}>Grida AI Gateway</p>
            <h1 id="gateway-title">
              Creative models.
              <br />
              One API.
            </h1>
            <p className={styles.description}>
              Generate images, video, audio, and 3D assets. One integration for
              your apps, agents, and workflows.
            </p>
            <div className={styles.actions}>
              <Link href={sitemap.links.ai_models} className={styles.primary}>
                Explore models <ArrowRight aria-hidden="true" />
              </Link>
              <Link href={sitemap.links.contact} className={styles.secondary}>
                Talk to us <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <figure
            className={styles.diagram}
            aria-label="Your application connects through one Grida Gateway key to multiple model providers"
          >
            <div className={styles.diagramHeader}>
              <KeyRound aria-hidden="true" />
              <span>One key. Your choice of models.</span>
            </div>
            <div className={styles.routing} aria-hidden="true">
              <svg
                className={styles.connections}
                viewBox="0 0 640 360"
                fill="none"
                preserveAspectRatio="none"
              >
                <path d="M80 180H272 M272 180C400 180 370 36 490 36 M272 180C400 180 370 108 490 108 M272 180H490 M272 180C400 180 370 252 490 252 M272 180C400 180 370 324 490 324" />
                <path
                  className={styles.flow}
                  d="M80 180H272C400 180 370 108 490 108"
                />
              </svg>
              <div className={styles.application}>
                <span className={styles.appIcon}>
                  <AppWindow />
                </span>
                <span>Your app</span>
              </div>
              <div className={styles.gateway}>
                <span className={styles.gatewaySymbol}>GG</span>
                <span>Grida Gateway</span>
              </div>
              <div className={styles.providers}>
                {providers.map(({ name, Logo }) => (
                  <div className={styles.provider} key={name}>
                    <Logo />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>
            <figcaption className={styles.diagramFooter}>
              <span>Routing</span>
              <span>Generation</span>
              <span>Usage</span>
            </figcaption>
          </figure>
        </section>

        <section
          className={styles.capabilities}
          aria-label="Gateway capabilities"
        >
          {capabilities.map(({ title, copy }) => (
            <div key={title}>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          ))}
        </section>
      </main>
      <Footer className="border-0" />
    </div>
  );
}
