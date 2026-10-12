// GRIDA-GG: gateway — standalone product overview.
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Server } from "lucide-react";
import {
  OpenAILogo,
  ByteDanceLogo,
  GoogleLogo,
  BlackForestLabsLogo,
  TripoLogo,
} from "@grida/react-icons/logos";
import { GridaLogo } from "@/components/grida-logo";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { sitemap } from "@/www/data/sitemap";
import { ConsoleLinks } from "@/lib/platform/console-links";
import Showcase from "./_sections/showcase";
import { CREATIVE_CODE, OPENAI_CODE } from "./_sections/content";
import { highlightCode } from "./_sections/highlight";
import styles from "./page.module.css";

const title = "AI Gateway: One API for Text, Image, Video and 3D — Grida";
const description =
  "Grida AI Gateway: one API for text, image, video, and 3D models. OpenAI-compatible, paid with Grida AI credits.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Grida AI Gateway",
    "AI gateway",
    "OpenAI-compatible API",
    "LLM API",
    "image generation API",
    "video generation API",
    "3D generation API",
    "AI credits",
  ],
  metadataBase: new URL("https://grida.co"),
  alternates: { canonical: "https://grida.co/ai/gateway" },
  openGraph: {
    title,
    description,
    url: "https://grida.co/ai/gateway",
    siteName: "Grida",
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
};

/** WebAPI entity for the gateway; its contract is the published llms.txt. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  name: "Grida AI Gateway",
  description,
  url: "https://grida.co/ai/gateway",
  documentation: "https://gateway.grida.ai/llms.txt",
  provider: { "@type": "Organization", name: "Grida", url: "https://grida.co" },
};

const providers = [
  { name: "OpenAI", Logo: OpenAILogo },
  { name: "ByteDance", Logo: ByteDanceLogo },
  { name: "Google", Logo: GoogleLogo },
  { name: "Black Forest Labs", Logo: BlackForestLabsLogo },
  { name: "Tripo", Logo: TripoLogo },
];

export default async function AIGatewayPage() {
  const [creativeHtml, openaiHtml] = await Promise.all([
    highlightCode(CREATIVE_CODE, "ts"),
    highlightCode(OPENAI_CODE, "ts"),
  ]);

  return (
    <div className={styles.page} data-testid="ai-gateway-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <Header />
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="gateway-title">
          <div className={styles.intro}>
            <h1 id="gateway-title">
              <span className={styles.eyebrow}>Grida AI Gateway</span>
              Creative models.
              <br />
              One API.
            </h1>
            <p className={styles.description}>
              Generate images, video, and 3D assets. One integration for your
              apps, agents, and workflows.
            </p>
            <div className={styles.actions}>
              <a href={ConsoleLinks.aiGateway()} className={styles.primary}>
                Get API key <ArrowUpRight aria-hidden="true" />
              </a>
              <Link href={sitemap.links.ai_models} className={styles.secondary}>
                Explore models <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <a
              href="https://gateway.grida.ai/llms.txt"
              className={styles.reference}
            >
              API reference <code>llms.txt</code>
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>

          <figure className={styles.diagram}>
            <Showcase
              items={[
                {
                  value: "overview",
                  label: "Overview",
                  body: (
                    <div
                      key="overview"
                      className={styles.routing}
                      role="img"
                      aria-label="Your application connects through one Grida Gateway key to multiple model providers"
                    >
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
                          <Server />
                        </span>
                        <span className={styles.nodeLabel}>Your app</span>
                      </div>
                      <div className={styles.gateway}>
                        <span className={styles.gatewaySymbol}>
                          <GridaLogo />
                        </span>
                        <span className={styles.nodeLabel}>Grida Gateway</span>
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
                  ),
                  footer: ["Routing", "Generation", "Usage"],
                },
                {
                  value: "creative",
                  label: "Creative",
                  body: (
                    <div
                      key="creative"
                      className={styles.code}
                      dangerouslySetInnerHTML={{ __html: creativeHtml }}
                    />
                  ),
                  footer: ["Images", "Video", "3D"],
                },
                {
                  value: "openai",
                  label: "OpenAI compatible",
                  body: (
                    <div
                      key="openai"
                      className={styles.code}
                      dangerouslySetInnerHTML={{ __html: openaiHtml }}
                    />
                  ),
                  footer: ["Chat Completions", "Responses", "Streaming"],
                },
              ]}
            />
          </figure>
        </section>
      </main>
      <Footer className="border-0" />
    </div>
  );
}
