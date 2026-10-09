"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  AlibabaCloudLogo,
  RecraftLogo,
  BlackForestLabsLogo,
  ByteDanceLogo,
  GoogleLogo,
  OpenAILogo,
  TripoLogo,
} from "@grida/react-icons/logos";
import styles from "./models-section.module.css";
import { CoverFlowCarousel } from "./cover-flow-carousel";

// Model labels are temporary; artwork is not attributed to the named models.
const models = [
  {
    name: "GPT Image 2.5",
    lab: "OpenAI",
    Logo: OpenAILogo,
    image: "/www/2026-10/models-horses-bw-v1.webp",
    alt: "A black-and-white photograph of two horses standing together in windswept coastal grassland",
  },
  {
    name: "Gemini Omni 1.1",
    lab: "Google",
    Logo: GoogleLogo,
    image: "/www/2026-10/model-videos/coastal-romance-vhs-v4-editorial.webp",
    video: "/www/2026-10/model-videos/coastal-romance-vhs-v4-editorial.mp4",
    alt: "A fast-cut VHS romance montage of a young adult couple by the coast",
  },
  {
    name: "Recraft V4.1",
    lab: "Recraft",
    Logo: RecraftLogo,
    image: "/www/2026-10/models-koi.webp",
    alt: "Coral-red koi swimming through a midnight-blue illustrated pool",
  },
  {
    name: "Flux 2 Pro",
    lab: "Black Forest Labs",
    Logo: BlackForestLabsLogo,
    image: "/www/2026-10/models-social-gathering.webp",
    alt: "Four friends sharing drinks and smiling on a rooftop terrace",
  },
  {
    name: "Gemini 3 Pro Image",
    lab: "Google",
    Logo: GoogleLogo,
    image: "/www/2026-10/models-vinyl-player-v1.webp",
    alt: "An ivory upright vinyl record player with a black record on a neutral studio backdrop",
  },
  {
    name: "Wan 3.0",
    lab: "Alibaba",
    Logo: AlibabaCloudLogo,
    image: "/www/2026-10/model-videos/city-dance-3s.webp",
    video: "/www/2026-10/model-videos/city-dance-3s.mp4",
    alt: "A dancer performing a grounded street dance on a sunlit city boulevard",
  },
  {
    name: "Seedream 5.0 Pro",
    lab: "ByteDance",
    Logo: ByteDanceLogo,
    image: "/www/2026-10/models-portrait.webp",
    alt: "An artist with dark curly hair in the wind on a coastal headland",
  },
  {
    name: "Tripo H3.1",
    lab: "Tripo",
    Logo: TripoLogo,
    image: "/www/2026-10/models-tripo-nature-base-v1.webp",
    meshImage: "/www/2026-10/models-tripo-nature-mesh-full-v1.webp",
    alt: "A sandstone cabin and tree with a cutaway revealing polygon faces, edges and vertices beneath the textures",
  },
] as const;

/** React owns content; the controller owns scroll and gesture behavior. */
export default function ModelsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const carousel = new CoverFlowCarousel(sectionRef.current!);
    return () => carousel.dispose();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="models"
      aria-labelledby="models-heading"
      className={styles.section}
      style={{ "--model-count": models.length } as CSSProperties}
      data-testid="home-models-gallery"
    >
      <div className={styles.stage}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Models</p>
          <h2 id="models-heading" className={styles.heading}>
            More ways to create.
          </h2>
        </div>

        <div
          className={styles.viewport}
          role="region"
          aria-roledescription="carousel"
          aria-label="Model examples"
          aria-describedby="models-controls-hint"
          tabIndex={0}
        >
          <div className={styles.ribbon}>
            {models.map((model) => {
              const { name, lab, Logo, image, alt } = model;
              return (
                <figure key={name} className={styles.exhibit}>
                  <button
                    type="button"
                    aria-label={`View ${name}`}
                    tabIndex={-1}
                    className={styles.artwork}
                  >
                    <div className={styles.artworkSurface}>
                      {"video" in model ? (
                        <video
                          src={model.video}
                          poster={image}
                          aria-label={alt}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          draggable={false}
                          className={`${styles.image} ${styles.video}`}
                        />
                      ) : (
                        <>
                          <Image
                            src={image}
                            alt={alt}
                            fill
                            sizes="(max-width: 900px) 80vw, 404px"
                            draggable={false}
                            className={styles.image}
                          />
                          {"meshImage" in model && (
                            <div
                              className={styles.meshReveal}
                              data-model-mesh
                              aria-hidden="true"
                            >
                              <Image
                                src={model.meshImage}
                                alt=""
                                fill
                                sizes="(max-width: 900px) 80vw, 404px"
                                draggable={false}
                                className={styles.image}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                  <figcaption className={styles.caption}>
                    <h3 className={styles.modelName}>{name}</h3>
                    <span role="img" aria-label={lab} className={styles.logo}>
                      <Logo />
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
        <p id="models-controls-hint" className="sr-only">
          Click an image, scroll to explore, drag horizontally, or use the left
          and right arrow keys.
        </p>

        <div className={styles.afterword}>
          <Link href="/ai/models" className={styles.link}>
            Explore all models
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
