"use client";

import Image from "next/image";
import { Check, Pencil, SwatchBook } from "lucide-react";
import WorkflowEdgesView from "./workflow-edges-view";
import type { WorkflowEdge } from "./workflow-edges";
import styles from "./product-design-preview.module.css";

const materials = [
  { name: "Natural oak", detail: "Bent plywood", key: "oak" },
  { name: "Brushed aluminum", detail: "Satin finish", key: "aluminum" },
  { name: "Smoked resin", detail: "Translucent", key: "resin" },
] as const;

const edges = [
  { from: "source", to: "process" },
  { from: "process", to: "oak" },
  { from: "process", to: "aluminum", route: "above" },
  { from: "process", to: "resin", route: "above" },
] as const satisfies readonly WorkflowEdge[];

export default function ProductDesignPreview() {
  return (
    <div className={styles.stage} data-testid="home-fx-product-design-preview">
      <div className={styles.intro}>
        <h3>Same form. New possibilities.</h3>
        <p>Take a sketch in a few different directions.</p>
      </div>
      <div className={styles.composition}>
        <WorkflowEdgesView edges={edges} />
        <div className={styles.workflow}>
          <div className={styles.source} data-workflow-node="source">
            <span className={styles.nodeLabel}>
              <Pencil aria-hidden="true" />
              Your sketch
            </span>
            <div className={styles.sketch}>
              <svg
                viewBox="0 0 200 190"
                role="img"
                aria-label="Line sketch of a curved cantilever chair"
              >
                <g
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M 76 20 Q 72 17 70 25 L 60 86 Q 60 98 75 102 L 126 113 Q 147 118 143 130 L 132 155 Q 130 160 119 160 L 60 149 Q 51 147 55 142 L 65 135" />
                  <path d="M 76 20 L 131 32 Q 139 34 137 44 L 127 98 Q 125 103 132 107 L 155 114 Q 174 120 168 133 L 153 166 Q 150 172 139 170 L 60 153" />
                  <path d="M 60 86 L 127 101 M 75 102 L 103 89 M 126 113 L 151 104 M 119 160 L 144 146 L 79 134 L 55 142" />
                  <path
                    d="M 73 30 L 66 81 M 133 42 L 126 86 M 153 123 L 141 150"
                    opacity=".3"
                  />
                </g>
                <g
                  stroke="currentColor"
                  strokeWidth=".5"
                  opacity=".22"
                  fill="none"
                >
                  <path d="M 35 177 H 167 M 40 22 V 166 M 35 26 H 46 M 35 163 H 46" />
                </g>
              </svg>
              <span>FORM STUDY / 01</span>
            </div>
          </div>
          <div className={styles.nodeGap} />
          <div className={styles.process} data-workflow-node="process">
            <span className={styles.nodeLabel}>
              <SwatchBook aria-hidden="true" />
              Explore materials
            </span>
            <p>
              Keep the silhouette.
              <br />
              Change the material.
            </p>
            <div
              className={styles.swatches}
              aria-label="Oak, aluminum, and smoked resin"
            >
              <i />
              <i />
              <i />
            </div>
            <span className={styles.ready}>
              <Check aria-hidden="true" />
              Same angle. Same form.
            </span>
          </div>
        </div>

        <div className={styles.studies}>
          {materials.map((material, index) => (
            <figure key={material.key} data-workflow-node={material.key}>
              <div className={styles.studyArt}>
                <Image
                  src="/www/2026-10/fx-product-design/material-studies.webp"
                  alt={`The same cantilever chair in ${material.name.toLowerCase()}`}
                  width={1536}
                  height={1024}
                  unoptimized
                  loading="lazy"
                  draggable={false}
                  style={{ left: `${index * -100}%` }}
                />
                <span className={styles.number}>0{index + 1}</span>
              </div>
              <figcaption>
                <span>{material.name}</span>
                <span>{material.detail}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
