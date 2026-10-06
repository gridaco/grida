"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { PauseIcon, PlayIcon } from "lucide-react";
import { FXWorldStory } from "./fx-world-story";
import styles from "./fx-world-section.module.css";

import artwork from "@/public/www/2026-10/wind-garden-repaint/manifest.json";

/** Plays assets exported by FX; the workflow runs at authoring time. */
export default function FXWorldSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const story = new FXWorldStory(sectionRef.current!);
    return () => story.dispose();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="fx-world"
      aria-labelledby="fx-world-heading"
      data-testid="home-fx-world-story"
      data-seamless={artwork.seamless}
      className={styles.section}
    >
      <div className={styles.stage} data-world-stage>
        <div className={styles.intro}>
          <h2 id="fx-world-heading">
            Build a world.<span>Layer by layer.</span>
          </h2>
          <p>Build a looping game background with Grida FX.</p>
        </div>
        <p className="sr-only">
          Grida FX repaints the joins in five prepared landscape layers so they
          loop continuously. Sky, hills, trees, ground, and foreground move at
          different speeds to create depth. Drag the background horizontally or
          use the left and right arrow keys to explore. Pause or adjust the
          motion below.
        </p>

        <div className={styles.visual}>
          <figure className={styles.reference} aria-hidden="true">
            <div className={styles.referenceArt}>
              <Image
                src={artwork.reference}
                alt=""
                fill
                sizes="(max-width: 900px) 90vw, 600px"
                draggable={false}
              />
            </div>
            <figcaption>Source artwork</figcaption>
          </figure>

          <div className={styles.connection} aria-hidden="true">
            <i />
            <span>f(x)</span>
            <i />
          </div>

          <div
            className={styles.world}
            data-world-scene
            role="group"
            aria-label="Parallax landscape preview"
            tabIndex={0}
          >
            {artwork.layers.map((layer, index) => (
              <div
                key={layer.id}
                className={styles.plane}
                aria-hidden="true"
                data-world-layer={layer.id}
                data-world-tile-ratio={layer.width / layer.height}
                data-world-parallax={layer.parallax}
                style={
                  {
                    "--layer-offset": index - 2,
                    "--layer-image": `url(${layer.file})`,
                    zIndex: layer.order,
                  } as CSSProperties
                }
              >
                <div className={styles.layerArtwork} />
                <span className={styles.layerName}>{layer.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.steps} aria-hidden="true">
          <span data-step="reference">Artwork</span>
          <i />
          <span data-step="layers">Seams</span>
          <i />
          <span data-step="assemble">Depth</span>
          <i />
          <span data-step="playback">Loop</span>
        </div>

        <div className={styles.controls} data-world-controls>
          <button
            type="button"
            data-world-action="toggle-playback"
            aria-label="Play motion"
            aria-pressed="false"
            className={styles.playButton}
          >
            <PlayIcon
              className={styles.playIcon}
              size={15}
              aria-hidden="true"
            />
            <PauseIcon
              className={styles.pauseIcon}
              size={15}
              aria-hidden="true"
            />
            <span data-world-playback-label>Play motion</span>
          </button>
          <label className={styles.speed}>
            <span>Speed</span>
            <input
              type="range"
              min="0.25"
              max="1.75"
              step="0.25"
              defaultValue="1"
              data-world-speed
              aria-label="Scene motion speed"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
